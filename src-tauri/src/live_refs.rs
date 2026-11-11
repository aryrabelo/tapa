//! Live references: a note writes `[herdr-openrig w1BA:p1]` and Tapa shows the
//! output of a command the user configured in Settings next to it.
//!
//! Safety model. A note never defines a command. The kinds of reference (a
//! regex, a program and an argv template) live in `live-refs.json` in the app
//! config dir, written only by `live_refs_save` from Settings. The frontend only
//! sends the text inside the brackets; Rust matches it against the config,
//! and only the regex CAPTURES reach argv, each as one whole element that has
//! passed a conservative charset. No shell, no stdin, a cleared environment, a
//! timeout that kills the process group, and a cap on what is read.
//!
//! Approval. The webview renders untrusted Markdown, so a save coming from it is
//! not proof the human wants it. Whenever a save adds or changes what can run
//! (a new kind, a changed match/program/args, or disabled → enabled),
//! `live_refs_save` shows a NATIVE dialog listing each such kind's name, match
//! and full argv, and writes nothing unless the human presses Allow. There is no
//! command that runs an unsaved kind.
//!
//! Editing `live-refs.json` by hand is the user's own act: it is trusted as
//! written and takes effect on the next app start (the config is cached).

use parking_lot::Mutex;
use regex::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{mpsc, Arc};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};

const FILE_NAME: &str = "live-refs.json";
const MAX_FILE_BYTES: u64 = 64 * 1024;
const MAX_KINDS: usize = 32;
const MAX_MATCH_LEN: usize = 256;
const REGEX_SIZE_LIMIT: usize = 1 << 20;
const MAX_ARGS: usize = 16;
const MAX_ARG_LEN: usize = 256;
const MAX_PLACEHOLDER: usize = 4;
const INTERVAL_MIN: u32 = 2;
const INTERVAL_MAX: u32 = 3600;
const TIMEOUT_MIN: u32 = 200;
const TIMEOUT_MAX: u32 = 10_000;
const MAX_TEXT_LEN: usize = 160;
const MAX_RESOLVE: usize = 200;
const MAX_CAPTURE_LEN: usize = 128;
const STDOUT_CAP: usize = 16 * 1024;
const STDERR_CAP: usize = 1024;
const STATE_MAX_CHARS: usize = 48;
const DETAIL_MAX_BYTES: usize = 4 * 1024;
const DETAIL_MAX_LINES: usize = 64;
const MAX_CONCURRENT: usize = 4;
const POLL_STEP: Duration = Duration::from_millis(20);
const READER_GRACE: Duration = Duration::from_millis(200);
#[cfg(windows)]
const TASKKILL_WAIT: Duration = Duration::from_secs(2);

// ---------------------------------------------------------------- config

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct JsonPointers {
    pub status: String,
    /// Status pointer tried when `status` is missing, null or empty.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status_fallback: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// `"text"`: first line is the state. `{"json": {...}}`: JSON Pointers.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum Parse {
    #[default]
    Text,
    Json(JsonPointers),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Kind {
    pub name: String,
    #[serde(rename = "match")]
    pub pattern: String,
    pub program: String,
    pub args: Vec<String>,
    #[serde(default = "default_interval")]
    pub interval_sec: u32,
    #[serde(default = "default_timeout")]
    pub timeout_ms: u32,
    #[serde(default)]
    pub parse: Parse,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_interval() -> u32 {
    10
}
fn default_timeout() -> u32 {
    3000
}
fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LiveRefsConfig {
    pub version: u32,
    pub kinds: Vec<Kind>,
}

impl Default for LiveRefsConfig {
    fn default() -> Self {
        Self {
            version: 1,
            kinds: Vec::new(),
        }
    }
}

/// A kind whose regex compiled and whose template was checked.
#[derive(Debug, Clone)]
struct Compiled {
    kind: Kind,
    re: Regex,
}

fn valid_name(name: &str) -> bool {
    let mut chars = name.chars();
    matches!(chars.next(), Some('a'..='z'))
        && name.len() <= 32
        && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// `{1}`..`{4}` when the WHOLE element is a placeholder.
fn placeholder(arg: &str) -> Option<usize> {
    let inner = arg.strip_prefix('{')?.strip_suffix('}')?;
    match inner.parse::<usize>() {
        Ok(n) if (1..=MAX_PLACEHOLDER).contains(&n) && inner.len() == 1 => Some(n),
        _ => None,
    }
}

/// True when `{` digits `}` appears anywhere in the element.
fn contains_placeholder_token(arg: &str) -> bool {
    arg.split('{').skip(1).any(|rest| {
        let digits = rest.bytes().take_while(u8::is_ascii_digit).count();
        digits > 0 && rest.as_bytes().get(digits) == Some(&b'}')
    })
}

fn is_executable(path: &Path) -> bool {
    let Ok(meta) = std::fs::metadata(path) else {
        return false;
    };
    if !meta.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        meta.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        true
    }
}

fn compile_kind(kind: &Kind, check_program: bool) -> Result<Compiled, String> {
    let n = &kind.name;
    if !valid_name(n) {
        return Err(format!(
            "name `{n}`: use lowercase letters, digits and -, starting with a letter (max 32)"
        ));
    }
    if kind.pattern.is_empty() || kind.pattern.len() > MAX_MATCH_LEN {
        return Err(format!(
            "{n}: match must be 1 to {MAX_MATCH_LEN} characters"
        ));
    }
    let re = RegexBuilder::new(&format!("^(?:{})$", kind.pattern))
        .size_limit(REGEX_SIZE_LIMIT)
        .build()
        .map_err(|e| format!("{n}: match is not a valid pattern: {e}"))?;
    let groups = re.captures_len() - 1;
    if kind.args.len() > MAX_ARGS {
        return Err(format!("{n}: at most {MAX_ARGS} arguments"));
    }
    for arg in &kind.args {
        if arg.len() > MAX_ARG_LEN {
            return Err(format!("{n}: an argument is longer than {MAX_ARG_LEN}"));
        }
        match placeholder(arg) {
            Some(i) if i > groups => {
                return Err(format!(
                    "{n}: `{arg}` refers to group {i}, but match has {groups} group(s)"
                ))
            }
            Some(_) => {}
            None if contains_placeholder_token(arg) => {
                return Err(format!(
                    "{n}: `{arg}`: a placeholder must be a whole argument, {{1}} to {{4}}"
                ))
            }
            None => {}
        }
    }
    if !(INTERVAL_MIN..=INTERVAL_MAX).contains(&kind.interval_sec) {
        return Err(format!(
            "{n}: interval must be {INTERVAL_MIN} to {INTERVAL_MAX} seconds"
        ));
    }
    if !(TIMEOUT_MIN..=TIMEOUT_MAX).contains(&kind.timeout_ms) {
        return Err(format!(
            "{n}: timeout must be {TIMEOUT_MIN} to {TIMEOUT_MAX} ms"
        ));
    }
    if let Parse::Json(p) = &kind.parse {
        for ptr in std::iter::once(&p.status)
            .chain(p.status_fallback.iter())
            .chain(p.detail.iter())
            .chain(p.error.iter())
        {
            if !(ptr.is_empty() || ptr.starts_with('/')) || ptr.len() > MAX_ARG_LEN {
                return Err(format!("{n}: JSON pointer `{ptr}` must start with /"));
            }
        }
    }
    let program = Path::new(&kind.program);
    if !program.is_absolute() {
        return Err(format!("{n}: program must be an absolute path (use Find)"));
    }
    if check_program && !is_executable(program) {
        return Err(format!("{n}: {} is not an executable file", kind.program));
    }
    Ok(Compiled {
        kind: kind.clone(),
        re,
    })
}

fn compile(config: &LiveRefsConfig, check_program: bool) -> Result<Vec<Compiled>, String> {
    if config.kinds.len() > MAX_KINDS {
        return Err(format!("at most {MAX_KINDS} kinds"));
    }
    let mut seen = HashSet::new();
    let mut out = Vec::with_capacity(config.kinds.len());
    for kind in &config.kinds {
        if !seen.insert(kind.name.as_str()) {
            return Err(format!("name `{}` is used twice", kind.name));
        }
        out.push(compile_kind(kind, check_program)?);
    }
    Ok(out)
}

// ---------------------------------------------------------------- resolve

fn valid_text(text: &str) -> bool {
    (1..=MAX_TEXT_LEN).contains(&text.len()) && !text.contains(['[', ']', '\n', '\r'])
}

/// First enabled kind, in config order, whose pattern matches the whole text.
fn resolve<'a>(kinds: &'a [Compiled], text: &str) -> Option<&'a Compiled> {
    if !valid_text(text) {
        return None;
    }
    kinds.iter().find(|k| k.kind.enabled && k.re.is_match(text))
}

fn valid_capture(cap: &str) -> bool {
    (1..=MAX_CAPTURE_LEN).contains(&cap.len())
        && !cap.starts_with('-')
        && cap
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._:@/-".contains(&b))
}

/// The argv for `text`: literal template elements plus validated captures.
fn build_argv(kind: &Compiled, text: &str) -> Result<Vec<String>, String> {
    let caps = kind.re.captures(text).ok_or("no match")?;
    kind.kind
        .args
        .iter()
        .map(|arg| match placeholder(arg) {
            None => Ok(arg.clone()),
            Some(i) => {
                let cap = caps.get(i).map(|m| m.as_str()).unwrap_or("");
                if valid_capture(cap) {
                    Ok(cap.to_string())
                } else {
                    Err(format!("group {i} is not a safe argument"))
                }
            }
        })
        .collect()
}

// ---------------------------------------------------------------- result

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RefStatus {
    Ok,
    Error,
    Timeout,
    UnknownRef,
    InvalidArg,
    Busy,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RefResult {
    pub status: RefStatus,
    pub name: Option<String>,
    pub state: String,
    pub detail: String,
    pub exit_code: Option<i32>,
    pub ms: u64,
}

impl RefResult {
    fn bare(status: RefStatus, name: Option<String>, state: &str) -> Self {
        Self {
            status,
            name,
            state: state.to_string(),
            detail: String::new(),
            exit_code: None,
            ms: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Resolved {
    pub name: String,
    pub interval_sec: u32,
}

/// Remove ANSI CSI/OSC sequences and C0 controls other than newline and tab.
fn strip_controls(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '\x1b' => match chars.peek() {
                Some('[') => {
                    chars.next();
                    // Parameters and intermediates, then one final byte @..~.
                    for c in chars.by_ref() {
                        if ('@'..='~').contains(&c) {
                            break;
                        }
                    }
                }
                Some(']') => {
                    chars.next();
                    // OSC ends at BEL or ESC \.
                    while let Some(c) = chars.next() {
                        if c == '\x07' {
                            break;
                        }
                        if c == '\x1b' {
                            if chars.peek() == Some(&'\\') {
                                chars.next();
                            }
                            break;
                        }
                    }
                }
                Some(_) => {
                    chars.next();
                }
                None => {}
            },
            '\n' | '\t' => out.push(c),
            c if c.is_control() => {}
            c => out.push(c),
        }
    }
    out
}

fn truncate_chars(s: &str, max: usize) -> String {
    match s.char_indices().nth(max) {
        Some((i, _)) => format!("{}…", &s[..i]),
        None => s.to_string(),
    }
}

fn clean_detail(raw: &str) -> String {
    let mut out = String::new();
    for line in strip_controls(raw).lines().take(DETAIL_MAX_LINES) {
        let line = line.trim_end();
        if out.len() + line.len() + 1 > DETAIL_MAX_BYTES {
            let room = DETAIL_MAX_BYTES.saturating_sub(out.len());
            let mut cut = room.min(line.len());
            while !line.is_char_boundary(cut) {
                cut -= 1;
            }
            out.push_str(&line[..cut]);
            break;
        }
        out.push_str(line);
        out.push('\n');
    }
    out.trim_end().to_string()
}

fn first_line(s: &str) -> String {
    let line = s
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .unwrap_or("");
    truncate_chars(line, STATE_MAX_CHARS)
}

fn json_text(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Null => String::new(),
        other => other.to_string(),
    }
}

/// Turn a finished run into what the chip shows.
fn interpret(
    parse: &Parse,
    stdout: &str,
    stderr: &str,
    exit: Option<i32>,
) -> (RefStatus, String, String) {
    let out = clean_detail(stdout);
    let err = clean_detail(stderr);
    if let Parse::Json(p) = parse {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(stdout.trim()) {
            let get = |ptr: &str| v.pointer(ptr).map(json_text).filter(|s| !s.is_empty());
            if let Some(msg) = p.error.as_deref().and_then(get) {
                return (
                    RefStatus::Error,
                    first_line(&strip_controls(&msg)),
                    clean_detail(&msg),
                );
            }
            if exit == Some(0) {
                let state = get(&p.status).or_else(|| p.status_fallback.as_deref().and_then(get));
                if let Some(state) = state {
                    let detail = p.detail.as_deref().and_then(get).unwrap_or_default();
                    return (
                        RefStatus::Ok,
                        first_line(&strip_controls(&state)),
                        clean_detail(&detail),
                    );
                }
                return (RefStatus::Error, "no status in output".into(), out);
            }
        } else if exit == Some(0) {
            return (RefStatus::Error, "output is not JSON".into(), out);
        }
    }
    match exit {
        Some(0) => {
            let state = first_line(&out);
            (RefStatus::Ok, state, out)
        }
        code => {
            let state = if !err.is_empty() {
                first_line(&err)
            } else if !out.is_empty() {
                first_line(&out)
            } else {
                match code {
                    Some(c) => format!("exit {c}"),
                    None => "killed".into(),
                }
            };
            let detail = if err.is_empty() { out } else { err };
            (RefStatus::Error, state, detail)
        }
    }
}

// ---------------------------------------------------------------- execute

fn minimal_env(cmd: &mut Command, program: &Path) {
    cmd.env_clear();
    for key in ["HOME", "USER", "LOGNAME", "LANG", "TMPDIR"] {
        if let Some(v) = std::env::var_os(key) {
            cmd.env(key, v);
        }
    }
    #[cfg(windows)]
    for key in [
        "SYSTEMROOT",
        "USERPROFILE",
        "TEMP",
        "TMP",
        "APPDATA",
        "LOCALAPPDATA",
    ] {
        if let Some(v) = std::env::var_os(key) {
            cmd.env(key, v);
        }
    }
    let mut dirs: Vec<PathBuf> = program
        .parent()
        .map(Path::to_path_buf)
        .into_iter()
        .collect();
    #[cfg(unix)]
    dirs.extend(["/usr/bin", "/bin", "/usr/sbin", "/sbin"].map(PathBuf::from));
    if let Ok(path) = std::env::join_paths(dirs) {
        cmd.env("PATH", path);
    }
    if let Some(home) = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")) {
        cmd.current_dir(home);
    }
}

/// Output read so far, available before the pipe closes.
struct Reader {
    buf: Arc<Mutex<Vec<u8>>>,
    done: mpsc::Receiver<()>,
}

impl Reader {
    /// True once the pipe has closed, waiting at most until `deadline`.
    fn closed_by(&self, deadline: Instant) -> bool {
        let left = deadline.saturating_duration_since(Instant::now());
        !matches!(
            self.done.recv_timeout(left),
            Err(mpsc::RecvTimeoutError::Timeout)
        )
    }

    fn take(&self) -> Vec<u8> {
        std::mem::take(&mut *self.buf.lock())
    }
}

/// Keep up to `cap` bytes as they arrive, then keep draining so the child never
/// blocks on a full pipe.
fn spawn_reader(src: Option<impl Read + Send + 'static>, cap: usize) -> Reader {
    let buf = Arc::new(Mutex::new(Vec::new()));
    let (tx, done) = mpsc::channel();
    if let Some(mut src) = src {
        let shared = Arc::clone(&buf);
        std::thread::spawn(move || {
            let mut chunk = [0u8; 4096];
            loop {
                match src.read(&mut chunk) {
                    Ok(0) => break,
                    Ok(n) => {
                        let mut kept = shared.lock();
                        let room = cap.saturating_sub(kept.len());
                        kept.extend_from_slice(&chunk[..n.min(room)]);
                    }
                    Err(e) if e.kind() == io::ErrorKind::Interrupted => {}
                    Err(_) => break,
                }
            }
            let _ = tx.send(());
        });
    }
    Reader { buf, done }
}

/// SIGKILL the process group the child led. The group outlives its leader while
/// any member exists, and its id cannot be reused while it exists.
#[cfg(unix)]
fn kill_group(child: &Child) {
    if let Ok(pid) = i32::try_from(child.id()) {
        // SAFETY: plain syscall; a negative pid addresses the group we created.
        unsafe {
            libc::kill(-pid, libc::SIGKILL);
        }
    }
}

/// Ends the whole tree of a child that is still running.
fn kill_tree(child: &mut Child) {
    // The child leads its own process group, so this also ends its helpers.
    #[cfg(unix)]
    kill_group(child);
    // Windows has no group to signal: taskkill /T walks the child's descendants.
    // The child still runs and we hold its handle, so its PID is not reused.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let root = std::env::var_os("SYSTEMROOT")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(r"C:\Windows"));
        let spawned = Command::new(root.join("System32").join("taskkill.exe"))
            .args(["/T", "/F", "/PID", &child.id().to_string()])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn();
        if let Ok(mut taskkill) = spawned {
            let deadline = Instant::now() + TASKKILL_WAIT;
            loop {
                match taskkill.try_wait() {
                    Ok(None) if Instant::now() < deadline => std::thread::sleep(POLL_STEP),
                    Ok(None) => {
                        let _ = taskkill.kill();
                        let _ = taskkill.wait();
                        break;
                    }
                    _ => break,
                }
            }
        }
    }
    let _ = child.kill();
}

/// The program has exited but something it started still holds its output open.
fn end_stragglers(child: &Child) {
    #[cfg(unix)]
    kill_group(child);
    // Windows: left alone. There is no group whose id stays reserved, and after
    // the program exits taskkill /T can only follow parent-PID links, which can
    // point at a reused PID. The output read so far is still returned; the
    // reader thread ends when the last holder closes the pipe.
    #[cfg(not(unix))]
    let _ = child;
}

fn execute(program: &str, argv: &[String], timeout: Duration, parse: &Parse) -> RefResult {
    let started = Instant::now();
    let program_path = Path::new(program);
    let mut cmd = Command::new(program_path);
    cmd.args(argv)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    minimal_env(&mut cmd, program_path);
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            let mut r = RefResult::bare(RefStatus::Error, None, "could not start");
            r.detail = clean_detail(&e.to_string());
            return r;
        }
    };
    let out = spawn_reader(child.stdout.take(), STDOUT_CAP);
    let err = spawn_reader(child.stderr.take(), STDERR_CAP);
    let deadline = started + timeout;
    let exit = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) if Instant::now() >= deadline => break None,
            Ok(None) => std::thread::sleep(POLL_STEP),
            Err(_) => break None,
        }
    };
    let timed_out = exit.is_none();
    if timed_out {
        kill_tree(&mut child);
        let _ = child.wait();
    }
    // A descendant can keep the pipes open after the program exits: take what was
    // read, and end the group so the descendants and the reader threads finish.
    let grace = Instant::now() + READER_GRACE;
    if !(out.closed_by(grace) && err.closed_by(grace)) {
        end_stragglers(&child);
        let grace = Instant::now() + READER_GRACE;
        let _ = out.closed_by(grace) && err.closed_by(grace);
    }
    let stdout = out.take();
    let stderr = err.take();
    let ms = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);
    if timed_out {
        let mut r = RefResult::bare(RefStatus::Timeout, None, "timeout");
        r.detail = clean_detail(&String::from_utf8_lossy(&stdout));
        r.ms = ms;
        return r;
    }
    let code = exit.and_then(|s| s.code());
    let (status, state, detail) = interpret(
        parse,
        &String::from_utf8_lossy(&stdout),
        &String::from_utf8_lossy(&stderr),
        code,
    );
    RefResult {
        status,
        name: None,
        state,
        detail,
        exit_code: code,
        ms,
    }
}

// ---------------------------------------------------------------- state

#[derive(Default)]
pub struct LiveRefsState {
    /// None until first read. Replaced on save.
    kinds: Mutex<Option<Vec<Compiled>>>,
    inflight: Mutex<HashSet<String>>,
    /// Serialises compare → ask → write across concurrent saves.
    save_lock: Mutex<()>,
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|d| d.join(FILE_NAME))
        .map_err(|e| e.to_string())
}

fn read_config(path: &Path) -> Result<LiveRefsConfig, String> {
    match std::fs::metadata(path) {
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(LiveRefsConfig::default()),
        Err(e) => return Err(e.to_string()),
        Ok(m) if m.len() > MAX_FILE_BYTES => return Err(format!("{FILE_NAME} is too large")),
        Ok(_) => {}
    }
    let raw = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| format!("{FILE_NAME}: {e}"))
}

/// The file body, refused when `read_config` would reject it at the next start.
fn config_body(config: &LiveRefsConfig) -> Result<Vec<u8>, String> {
    let body = serde_json::to_vec_pretty(config).map_err(|e| e.to_string())?;
    if u64::try_from(body.len()).unwrap_or(u64::MAX) > MAX_FILE_BYTES {
        return Err("too much to save: use fewer or shorter commands".to_string());
    }
    Ok(body)
}

fn write_config(path: &Path, body: &[u8]) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    crate::atomic_write::write_atomic(path, body).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

/// The compiled kinds, loading the file on first use. A broken file means no kinds.
fn kinds(app: &AppHandle, state: &LiveRefsState) -> Vec<Compiled> {
    let mut slot = state.kinds.lock();
    if slot.is_none() {
        let loaded = config_path(app)
            .and_then(|p| read_config(&p))
            .and_then(|c| compile(&c, false))
            .unwrap_or_default();
        *slot = Some(loaded);
    }
    slot.clone().unwrap_or_default()
}

/// Runs a resolved text, refusing a second run of the same text or a fifth at once.
fn run_text(kinds: &[Compiled], inflight: &Mutex<HashSet<String>>, text: &str) -> RefResult {
    let Some(kind) = resolve(kinds, text) else {
        return RefResult::bare(RefStatus::UnknownRef, None, "");
    };
    let name = Some(kind.kind.name.clone());
    let argv = match build_argv(kind, text) {
        Ok(a) => a,
        Err(e) => {
            let mut r = RefResult::bare(RefStatus::InvalidArg, name, "invalid argument");
            r.detail = e;
            return r;
        }
    };
    {
        let mut set = inflight.lock();
        if set.len() >= MAX_CONCURRENT || !set.insert(text.to_string()) {
            return RefResult::bare(RefStatus::Busy, name, "busy");
        }
    }
    let mut r = execute(
        &kind.kind.program,
        &argv,
        Duration::from_millis(u64::from(kind.kind.timeout_ms)),
        &kind.kind.parse,
    );
    inflight.lock().remove(text);
    r.name = name;
    r
}

// ---------------------------------------------------------------- commands

#[tauri::command]
pub fn live_refs_config(app: AppHandle) -> Result<LiveRefsConfig, String> {
    read_config(&config_path(&app)?)
}

/// Each kind whose save would add or change what can run, as the dialog shows it.
/// Kinds are matched by name; a renamed kind counts as new.
fn needs_approval(saved: &LiveRefsConfig, next: &LiveRefsConfig) -> Vec<String> {
    next.kinds
        .iter()
        .filter(|k| match saved.kinds.iter().find(|s| s.name == k.name) {
            None => true,
            Some(s) => {
                s.pattern != k.pattern
                    || s.program != k.program
                    || s.args != k.args
                    || (!s.enabled && k.enabled)
            }
        })
        .map(approval_text)
        .collect()
}

/// An argv element, quoted only when a bare rendering would be ambiguous.
fn show_arg(arg: &str) -> String {
    let plain = !arg.is_empty()
        && !arg
            .chars()
            .any(|c| c.is_whitespace() || c.is_control() || c == '"' || c == '\'' || c == '\\');
    if plain {
        arg.to_string()
    } else {
        serde_json::to_string(arg).unwrap_or_default()
    }
}

fn approval_text(kind: &Kind) -> String {
    let argv: Vec<String> = std::iter::once(kind.program.as_str())
        .chain(kind.args.iter().map(String::as_str))
        .map(show_arg)
        .collect();
    format!(
        "{}\nmatch: {}\nruns: {}",
        kind.name,
        show_arg(&kind.pattern),
        argv.join(" ")
    )
}

fn ask_approval(app: &AppHandle, items: &[String]) -> bool {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
    let body = format!(
        "A note can now run these commands when it shows a matching reference. \
         {{1}}..{{4}} are replaced by the text from the note.\n\n{}",
        items.join("\n\n")
    );
    app.dialog()
        .message(body)
        .title("Allow live reference commands?")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Allow".into(),
            "Cancel".into(),
        ))
        .blocking_show()
}

#[tauri::command]
pub async fn live_refs_save(
    app: AppHandle,
    config: LiveRefsConfig,
) -> Result<LiveRefsConfig, String> {
    let config = LiveRefsConfig {
        version: 1,
        kinds: config.kinds,
    };
    let compiled = compile(&config, true)?;
    let body = config_body(&config)?;
    // The native dialog blocks, so all of this runs off the main thread; the
    // lock keeps the compare-ask-write sequence from interleaving with another save.
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<LiveRefsState>();
        let _guard = state.save_lock.lock();
        let path = config_path(&app)?;
        let saved = read_config(&path).unwrap_or_default();
        let items = needs_approval(&saved, &config);
        if !items.is_empty() && !ask_approval(&app, &items) {
            return Err("not approved".to_string());
        }
        write_config(&path, &body)?;
        *state.kinds.lock() = Some(compiled);
        let _ = app.emit("live-refs-changed", ());
        Ok(config)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// For each candidate text, the kind that would handle it (or null).
#[tauri::command]
pub fn live_refs_resolve(
    app: AppHandle,
    state: State<'_, LiveRefsState>,
    texts: Vec<String>,
) -> Vec<Option<Resolved>> {
    let kinds = kinds(&app, &state);
    texts
        .iter()
        .take(MAX_RESOLVE)
        .map(|t| {
            resolve(&kinds, t).map(|k| Resolved {
                name: k.kind.name.clone(),
                interval_sec: k.kind.interval_sec,
            })
        })
        .collect()
}

#[tauri::command]
pub async fn live_refs_run(
    app: AppHandle,
    state: State<'_, LiveRefsState>,
    text: String,
) -> Result<RefResult, String> {
    let kinds = kinds(&app, &state);
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app2.state::<LiveRefsState>();
        run_text(&kinds, &state.inflight, &text)
    })
    .await
    .map_err(|e| e.to_string())
}

fn search_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect())
        .unwrap_or_default();
    #[cfg(unix)]
    {
        dirs.extend(["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"].map(PathBuf::from));
        if let Some(home) = std::env::var_os("HOME") {
            let home = PathBuf::from(home);
            for sub in [".local/bin", ".cargo/bin", ".bun/bin", ".nix-profile/bin"] {
                dirs.push(home.join(sub));
            }
        }
    }
    dirs
}

fn find_program_in(name: &str, dirs: &[PathBuf]) -> Option<String> {
    let ok = (1..=64).contains(&name.len())
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
        && !name.starts_with('.');
    if !ok {
        return None;
    }
    let names: Vec<String> = if cfg!(windows) {
        vec![format!("{name}.exe"), name.to_string()]
    } else {
        vec![name.to_string()]
    };
    dirs.iter()
        .filter(|d| d.is_absolute())
        .flat_map(|d| names.iter().map(move |n| d.join(n)))
        .find(|p| is_executable(p))
        .map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn live_refs_find_program(name: String) -> Option<String> {
    find_program_in(&name, &search_dirs())
}

// ---------------------------------------------------------------- tests

#[cfg(test)]
mod tests {
    use super::*;

    const BORA_MATCH: &str = r"(?:.{0,64} )?(w[0-9A-Za-z]{1,8}:p[0-9]{1,4})";

    fn kind(pattern: &str, program: &str, args: &[&str]) -> Kind {
        Kind {
            name: "k".into(),
            pattern: pattern.into(),
            program: program.into(),
            args: args.iter().map(|s| s.to_string()).collect(),
            interval_sec: 5,
            timeout_ms: 2000,
            parse: Parse::Text,
            enabled: true,
        }
    }

    fn compiled(k: Kind) -> Vec<Compiled> {
        vec![compile_kind(&k, false).expect("compiles")]
    }

    #[test]
    fn bora_preset_resolves_label_and_cli_forms() {
        let ks = compiled(kind(BORA_MATCH, "/bin/echo", &["pane", "get", "{1}"]));
        for (text, id) in [
            ("w1BA:p1", "w1BA:p1"),
            ("herdr-openrig w1BA:p1", "w1BA:p1"),
            ("herdr-openrig (2) w1BJ:p1", "w1BJ:p1"),
            ("bora pane get w1BA:p1", "w1BA:p1"),
        ] {
            let k = resolve(&ks, text).expect(text);
            assert_eq!(build_argv(k, text).unwrap(), ["pane", "get", id]);
        }
        for text in [
            "x",
            "herdr-openrig",
            "w1BA:p1 trailing",
            " ",
            "",
            "[w1BA:p1]",
        ] {
            assert!(resolve(&ks, text).is_none(), "{text}");
        }
    }

    #[test]
    fn unsafe_captures_are_invalid_even_if_the_pattern_allows_them() {
        let ks = compiled(kind(r"run (.+)", "/bin/echo", &["{1}"]));
        for text in ["run -rf", "run a;b", "run $(touch x)", "run a b", "run `x`"] {
            let k = resolve(&ks, text).expect(text);
            assert!(build_argv(k, text).is_err(), "{text}");
            let r = run_text(&ks, &Mutex::new(HashSet::new()), text);
            assert_eq!(r.status, RefStatus::InvalidArg, "{text}");
        }
        let long = format!("run {}", "a".repeat(129));
        assert_eq!(
            run_text(&ks, &Mutex::new(HashSet::new()), &long).status,
            RefStatus::InvalidArg
        );
    }

    #[test]
    fn label_text_never_reaches_argv() {
        let ks = compiled(kind(BORA_MATCH, "/bin/echo", &["{1}"]));
        let argv = build_argv(&ks[0], "rm -rf w1BA:p1").unwrap();
        assert_eq!(argv, ["w1BA:p1"]);
    }

    #[test]
    fn save_rejects_bad_kinds() {
        let bad = [
            kind(r"(a)", "/bin/echo", &["{2}"]),
            kind(r"a", "/bin/echo", &["{1}"]),
            kind(r"(", "/bin/echo", &[]),
            kind(r"(a)", "/bin/echo", &["--x={1}"]),
            kind(r"(a)", "echo", &["{1}"]),
            kind(r"(a)", "/definitely/not/here", &["{1}"]),
            Kind {
                interval_sec: 1,
                ..kind(r"(a)", "/bin/echo", &[])
            },
            Kind {
                timeout_ms: 50_000,
                ..kind(r"(a)", "/bin/echo", &[])
            },
            Kind {
                name: "Bad Name".into(),
                ..kind(r"(a)", "/bin/echo", &[])
            },
            kind(&"a".repeat(300), "/bin/echo", &[]),
        ];
        for k in bad {
            assert!(compile_kind(&k, true).is_err(), "{k:?}");
        }
        let dup = LiveRefsConfig {
            version: 1,
            kinds: vec![kind("a", "/bin/echo", &[]), kind("b", "/bin/echo", &[])],
        };
        assert!(compile(&dup, false).is_err());
    }

    #[test]
    fn first_enabled_kind_wins_and_disabled_is_skipped() {
        let mut a = kind(r"(x)", "/bin/echo", &["{1}"]);
        a.name = "a".into();
        a.enabled = false;
        let mut b = kind(r"(x)", "/bin/echo", &["{1}"]);
        b.name = "b".into();
        let mut c = b.clone();
        c.name = "c".into();
        let ks = compile(
            &LiveRefsConfig {
                version: 1,
                kinds: vec![a, b, c],
            },
            false,
        )
        .unwrap();
        assert_eq!(resolve(&ks, "x").unwrap().kind.name, "b");
    }

    #[test]
    fn config_round_trips_the_documented_json() {
        let raw = r#"{"version":1,"kinds":[{"name":"bora-pane","match":"(w1)","program":"/x/bora",
            "args":["pane","get","{1}"],"intervalSec":5,"timeoutMs":2000,
            "parse":{"json":{"status":"/result/pane/agent_status","detail":"/d","error":"/error/message"}},
            "enabled":true},{"name":"plain","match":"a","program":"/bin/echo","args":[],"parse":"text"}]}"#;
        let c: LiveRefsConfig = serde_json::from_str(raw).unwrap();
        assert!(matches!(c.kinds[0].parse, Parse::Json(_)));
        assert_eq!(c.kinds[1].parse, Parse::Text);
        assert_eq!(c.kinds[1].interval_sec, 10);
        let again: LiveRefsConfig =
            serde_json::from_str(&serde_json::to_string(&c).unwrap()).unwrap();
        assert_eq!(again, c);
    }

    #[test]
    fn status_fallback_is_optional_and_not_written_when_unset() {
        let raw = r#"{"status":"/s"}"#;
        let p: JsonPointers = serde_json::from_str(raw).unwrap();
        assert_eq!(p.status_fallback, None);
        assert!(!serde_json::to_string(&p)
            .unwrap()
            .contains("statusFallback"));
    }

    #[test]
    fn json_parse_matches_bora_output() {
        let p = Parse::Json(JsonPointers {
            status: "/result/pane/agent_status".into(),
            detail: Some("/result/pane/terminal_title_stripped".into()),
            error: Some("/error/message".into()),
            status_fallback: None,
        });
        let ok = r#"{"id":"cli:pane:get","result":{"pane":{"agent_status":"done","terminal_title_stripped":"Layout do OpenRig no herdr-app"}}}"#;
        assert_eq!(
            interpret(&p, ok, "", Some(0)),
            (
                RefStatus::Ok,
                "done".into(),
                "Layout do OpenRig no herdr-app".into()
            )
        );
        let err = r#"{"error":{"code":"pane_not_found","message":"pane w1ZZ:p9 not found"},"id":"cli:pane:get"}"#;
        let (s, state, _) = interpret(&p, err, "", Some(1));
        assert_eq!(
            (s, state.as_str()),
            (RefStatus::Error, "pane w1ZZ:p9 not found")
        );
        let (s, _, _) = interpret(&p, err, "", Some(0));
        assert_eq!(s, RefStatus::Error);
    }

    fn hc_pointers() -> Parse {
        Parse::Json(JsonPointers {
            status: "/status/state".into(),
            status_fallback: Some("/state".into()),
            detail: Some("/title".into()),
            error: Some("/error/message".into()),
        })
    }

    #[test]
    fn status_falls_back_when_the_primary_pointer_is_null() {
        let out = r#"{"state":"live","status":null,"title":"t"}"#;
        assert_eq!(
            interpret(&hc_pointers(), out, "", Some(0)),
            (RefStatus::Ok, "live".into(), "t".into())
        );
    }

    #[test]
    fn primary_status_wins_over_the_fallback() {
        let out =
            r#"{"state":"live","status":{"app":"claude-code","state":"working"},"title":"t"}"#;
        let (s, state, _) = interpret(&hc_pointers(), out, "", Some(0));
        assert_eq!((s, state.as_str()), (RefStatus::Ok, "working"));
    }

    #[test]
    fn no_status_and_no_fallback_is_an_error() {
        let (s, state, _) = interpret(&hc_pointers(), r#"{"title":"t"}"#, "", Some(0));
        assert_eq!(
            (s, state.as_str()),
            (RefStatus::Error, "no status in output")
        );
    }

    #[test]
    fn compile_rejects_a_relative_fallback_pointer() {
        let k = Kind {
            parse: Parse::Json(JsonPointers {
                status: "/s".into(),
                status_fallback: Some("state".into()),
                detail: None,
                error: None,
            }),
            ..kind(r"(a)", "/bin/echo", &["{1}"])
        };
        assert_eq!(
            compile_kind(&k, false).err().unwrap(),
            "k: JSON pointer `state` must start with /"
        );
    }

    #[test]
    fn strips_ansi_osc_and_controls() {
        let raw = "\x1b[31mred\x1b[0m \x1b]8;;http://x\x1b\\link\x1b]8;;\x07 ok\r\x07\tend";
        assert_eq!(strip_controls(raw), "red link ok\tend");
        assert_eq!(first_line("\n\n  hello \nworld"), "hello");
        assert_eq!(
            first_line(&"é".repeat(60)).chars().count(),
            STATE_MAX_CHARS + 1
        );
    }

    #[cfg(unix)]
    #[test]
    fn arguments_are_literal_argv_not_shell() {
        let dir = tempfile::tempdir().unwrap();
        let marker = dir.path().join("PWNED");
        let arg = format!("$(touch {})", marker.display());
        let r = execute(
            "/bin/echo",
            std::slice::from_ref(&arg),
            Duration::from_secs(2),
            &Parse::Text,
        );
        assert_eq!(r.status, RefStatus::Ok);
        assert_eq!(r.detail, arg);
        assert!(!marker.exists());
    }

    #[cfg(unix)]
    #[test]
    fn timeout_kills_the_whole_process_group() {
        let dir = tempfile::tempdir().unwrap();
        let pidfile = dir.path().join("pid");
        let script = format!("/bin/sleep 30 & echo $! > {}; wait", pidfile.display());
        let started = Instant::now();
        let r = execute(
            "/bin/sh",
            &["-c".into(), script],
            Duration::from_millis(300),
            &Parse::Text,
        );
        assert_eq!(r.status, RefStatus::Timeout);
        assert!(started.elapsed() < Duration::from_secs(2));
        let pid: i32 = std::fs::read_to_string(&pidfile)
            .unwrap()
            .trim()
            .parse()
            .unwrap();
        std::thread::sleep(Duration::from_millis(100));
        // SAFETY: signal 0 only checks existence.
        let alive = unsafe { libc::kill(pid, 0) } == 0;
        assert!(!alive, "grandchild sleep survived");
    }

    #[cfg(unix)]
    #[test]
    fn endless_output_is_capped_and_returns() {
        let started = Instant::now();
        let r = execute(
            "/usr/bin/yes",
            &[],
            Duration::from_millis(500),
            &Parse::Text,
        );
        assert_eq!(r.status, RefStatus::Timeout);
        assert!(r.detail.len() <= DETAIL_MAX_BYTES);
        assert!(started.elapsed() < Duration::from_secs(2));
    }

    #[cfg(unix)]
    #[test]
    fn child_environment_is_cleared() {
        std::env::set_var("TAPA_SECRET_FOR_TEST", "leak");
        let r = execute("/usr/bin/env", &[], Duration::from_secs(2), &Parse::Text);
        assert_eq!(r.status, RefStatus::Ok);
        assert!(!r.detail.contains("TAPA_SECRET_FOR_TEST"));
    }

    #[cfg(unix)]
    #[test]
    fn same_text_does_not_run_twice_at_once() {
        let ks = compiled(kind(r"(x)", "/bin/echo", &["{1}"]));
        let inflight = Mutex::new(HashSet::from(["x".to_string()]));
        assert_eq!(run_text(&ks, &inflight, "x").status, RefStatus::Busy);
        let inflight = Mutex::new(HashSet::new());
        let r = run_text(&ks, &inflight, "x");
        assert_eq!((r.status, r.state.as_str()), (RefStatus::Ok, "x"));
        assert!(inflight.lock().is_empty());
    }

    #[test]
    fn unknown_text_runs_nothing() {
        let ks = compiled(kind(r"(x)", "/bin/echo", &["{1}"]));
        assert_eq!(
            run_text(&ks, &Mutex::new(HashSet::new()), "y").status,
            RefStatus::UnknownRef
        );
    }

    #[test]
    fn placeholder_rule_rejects_only_embedded_tokens() {
        for args in [&["--x={1}"][..], &["a{2}b"], &["{5}"], &["{12}"]] {
            assert!(
                compile_kind(&kind(r"(a)", "/bin/echo", args), false).is_err(),
                "{args:?}"
            );
        }
        for args in [&["{print $1}"][..], &["{}"], &["{x}"], &["{"], &["{1}"]] {
            assert!(
                compile_kind(&kind(r"(a)", "/bin/echo", args), false).is_ok(),
                "{args:?}"
            );
        }
    }

    #[cfg(unix)]
    #[test]
    fn sh_kind_receives_capture_as_positional_parameter() {
        let k = kind(
            r"say (.+)",
            "/bin/sh",
            &["-c", r#"printf %s "$1""#, "_", "{1}"],
        );
        assert!(compile_kind(&k, true).is_ok());
        let ks = compiled(k);
        // `$HOME` would be expanded if the shell interpreted the capture; the
        // charset lets `$` never through, so use characters that still prove it.
        let r = run_text(&ks, &Mutex::new(HashSet::new()), "say a/b:c@d.e");
        assert_eq!((r.status, r.detail.as_str()), (RefStatus::Ok, "a/b:c@d.e"));
        let r = run_text(&ks, &Mutex::new(HashSet::new()), "say $HOME");
        assert_eq!(r.status, RefStatus::InvalidArg);
    }

    fn cfg(kinds: Vec<Kind>) -> LiveRefsConfig {
        LiveRefsConfig { version: 1, kinds }
    }

    fn named(name: &str) -> Kind {
        Kind {
            name: name.into(),
            ..kind(
                r"(?:.{0,64} )?(w[0-9]:p[0-9])",
                "/x/bora",
                &["pane", "get", "{1}"],
            )
        }
    }

    #[test]
    fn approval_needed_for_anything_that_changes_what_runs() {
        let saved = cfg(vec![named("a")]);
        let changes: [(&str, Kind); 5] = [
            ("new kind", named("b")),
            (
                "program",
                Kind {
                    program: "/x/other".into(),
                    ..named("a")
                },
            ),
            (
                "args",
                Kind {
                    args: vec!["pane".into(), "{1}".into()],
                    ..named("a")
                },
            ),
            (
                "match",
                Kind {
                    pattern: "(.+)".into(),
                    ..named("a")
                },
            ),
            (
                "name only",
                Kind {
                    name: "renamed".into(),
                    ..named("a")
                },
            ),
        ];
        for (why, k) in changes {
            let items = needs_approval(&saved, &cfg(vec![k]));
            assert_eq!(items.len(), 1, "{why}");
        }
        let off = cfg(vec![Kind {
            enabled: false,
            ..named("a")
        }]);
        assert_eq!(needs_approval(&off, &saved).len(), 1, "disabled → enabled");
    }

    #[test]
    fn no_approval_for_removal_disable_or_timing() {
        let saved = cfg(vec![named("a"), named("b")]);
        let cases = [
            cfg(vec![named("a")]),
            cfg(vec![]),
            cfg(vec![
                Kind {
                    enabled: false,
                    ..named("a")
                },
                named("b"),
            ]),
            cfg(vec![
                Kind {
                    interval_sec: 60,
                    timeout_ms: 500,
                    parse: Parse::Json(JsonPointers {
                        status: "/s".into(),
                        detail: None,
                        error: None,
                        status_fallback: None,
                    }),
                    ..named("a")
                },
                named("b"),
            ]),
            saved.clone(),
        ];
        for c in cases {
            assert!(needs_approval(&saved, &c).is_empty(), "{c:?}");
        }
    }

    #[test]
    fn approval_text_shows_exact_argv() {
        let k = kind(
            r"say (.+)",
            "/bin/sh",
            &["-c", r#"printf %s "$1""#, "_", "{1}"],
        );
        assert_eq!(
            approval_text(&k),
            "k\nmatch: \"say (.+)\"\nruns: /bin/sh -c \"printf %s \\\"$1\\\"\" _ {1}"
        );
        assert_eq!(
            approval_text(&named("a")),
            "a\nmatch: \"(?:.{0,64} )?(w[0-9]:p[0-9])\"\nruns: /x/bora pane get {1}"
        );
    }

    #[test]
    fn find_program_refuses_paths_and_finds_in_dirs() {
        assert!(find_program_in("../sh", &search_dirs()).is_none());
        assert!(find_program_in("/bin/sh", &search_dirs()).is_none());
        #[cfg(unix)]
        assert_eq!(
            find_program_in("sh", &[PathBuf::from("/bin")]).as_deref(),
            Some("/bin/sh")
        );
    }

    #[cfg(unix)]
    #[test]
    fn find_program_skips_relative_and_empty_path_entries() {
        // A relative entry that reaches /bin from the test's working directory.
        let depth = std::env::current_dir().unwrap().components().count() - 1;
        let rel: PathBuf = std::iter::repeat_n("..", depth)
            .collect::<PathBuf>()
            .join("bin");
        assert!(
            is_executable(&rel.join("sh")),
            "setup: {rel:?} reaches /bin"
        );
        let dirs = [PathBuf::new(), rel.clone(), PathBuf::from("/bin")];
        assert_eq!(find_program_in("sh", &dirs).as_deref(), Some("/bin/sh"));
        assert!(find_program_in("sh", &[PathBuf::new(), rel]).is_none());
    }

    #[test]
    fn save_refuses_a_body_the_next_start_would_reject() {
        let long = "a".repeat(MAX_ARG_LEN);
        let big = cfg((0..MAX_KINDS)
            .map(|i| Kind {
                name: format!("k{i}"),
                args: vec![long.clone(); MAX_ARGS],
                ..kind("a", "/bin/echo", &[])
            })
            .collect());
        // Within every per-kind limit, yet over the file limit.
        assert!(compile(&big, false).is_ok());
        assert!(config_body(&big).is_err());
        let body = config_body(&cfg(vec![named("a")])).unwrap();
        assert!(u64::try_from(body.len()).unwrap() <= MAX_FILE_BYTES);
    }

    #[cfg(unix)]
    #[test]
    fn output_returns_and_group_ends_when_a_helper_keeps_the_pipe_open() {
        let dir = tempfile::tempdir().unwrap();
        let pidfile = dir.path().join("pid");
        // The background sleep inherits stdout and outlives the shell.
        let script = format!("echo hi; /bin/sleep 30 & echo $! > {}", pidfile.display());
        let started = Instant::now();
        let r = execute(
            "/bin/sh",
            &["-c".into(), script],
            Duration::from_secs(5),
            &Parse::Text,
        );
        assert_eq!((r.status, r.state.as_str()), (RefStatus::Ok, "hi"));
        assert!(
            started.elapsed() < Duration::from_secs(1),
            "{:?}",
            started.elapsed()
        );
        let pid: i32 = std::fs::read_to_string(&pidfile)
            .unwrap()
            .trim()
            .parse()
            .unwrap();
        // Killed, then reaped by init: wait until the pid is gone.
        let gone_by = Instant::now() + Duration::from_secs(2);
        // SAFETY: signal 0 only checks existence.
        while unsafe { libc::kill(pid, 0) } == 0 && Instant::now() < gone_by {
            std::thread::sleep(Duration::from_millis(20));
        }
        // SAFETY: as above.
        assert!(
            unsafe { libc::kill(pid, 0) } != 0,
            "background sleep survived"
        );
    }
}
