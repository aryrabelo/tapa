//! Optional AI continuation with the user's own key ("bring your own key").
//!
//! Off by default. Nothing here touches the network until the user turns it on
//! in Settings and saves a key. The key lives in the OS keychain (macOS
//! Keychain, Windows Credential Manager, Secret Service on Linux) and never
//! crosses into the webview: the webview can set it, remove it and ask whether
//! one is saved, nothing more. The request is built and sent from here, with
//! the provider and model from a small `ai.json` in the app config folder.

use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, State};

/// Characters of text before the caret sent as context.
pub const MAX_BEFORE: usize = 1500;
/// Characters of text after the caret sent as context.
pub const MAX_AFTER: usize = 300;
/// Longest suggestion shown, in characters.
pub const MAX_OUTPUT: usize = 120;
/// Token cap on the reply: one short sentence, with room to spare.
const MAX_TOKENS: u32 = 60;
/// The whole request, connect included. A late suggestion is a useless one.
const TIMEOUT: Duration = Duration::from_secs(4);
/// Keychain service name; the account is the provider id.
const KEYCHAIN_SERVICE: &str = "com.aryrabelo.tapa.ai";

const OPENAI_URL: &str = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC_URL: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";

const SYSTEM_PROMPT: &str = "You are the autocomplete of a Markdown note editor. \
The user's note is given with <cursor/> marking the caret. Reply with only the text \
to insert at the caret: at most one short sentence, in the same language and voice, \
with no quotes, no Markdown and no explanation. If the word at the caret is \
unfinished, finish it. If the caret follows a complete word, start with a space. \
If nothing fits, reply with nothing.";

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    #[default]
    OpenAi,
    Anthropic,
}

impl Provider {
    /// Cheap, fast model used when the model field is left blank.
    pub fn default_model(self) -> &'static str {
        match self {
            // https://developers.openai.com/api/docs/models/gpt-6-luna
            Provider::OpenAi => "gpt-6-luna",
            // https://platform.claude.com/docs/en/models/haiku-5-5/overview
            Provider::Anthropic => "claude-haiku-5-5",
        }
    }

    fn account(self) -> &'static str {
        match self {
            Provider::OpenAi => "openai",
            Provider::Anthropic => "anthropic",
        }
    }
}

/// What Settings saves. Never holds the key.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct AiConfig {
    pub enabled: bool,
    pub provider: Provider,
    /// Blank means the provider's default model.
    pub model: String,
}

impl AiConfig {
    fn model(&self) -> &str {
        let m = self.model.trim();
        if m.is_empty() {
            self.provider.default_model()
        } else {
            m
        }
    }
}

#[derive(Debug, Serialize)]
pub struct DefaultModels {
    openai: &'static str,
    anthropic: &'static str,
}

/// What the webview may know: the settings and whether a key is saved.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiStatus {
    enabled: bool,
    provider: Provider,
    model: String,
    has_key: bool,
    default_models: DefaultModels,
}

/// Why a suggestion did not come. Serialized as `{ "kind": "badKey" }` etc.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AiError {
    /// AI suggestions are switched off.
    Off,
    /// No key saved for the chosen provider.
    NoKey,
    /// The provider refused the key (401/403).
    BadKey,
    RateLimited,
    Timeout,
    Network,
    /// Any other non-success status from the provider.
    Provider {
        status: u16,
    },
    /// The provider answered with something that is not the expected JSON.
    BadResponse,
    /// The OS keychain could not be read or written.
    Keychain,
    /// Settings could not be saved.
    Config,
}

/// A request ready to send: no I/O, so it can be checked in tests.
#[derive(Debug)]
pub struct AiRequest {
    pub url: &'static str,
    pub headers: Vec<(&'static str, String)>,
    pub body: Value,
}

fn tail_chars(s: &str, n: usize) -> &str {
    if n == 0 {
        return "";
    }
    match s.char_indices().rev().nth(n - 1) {
        Some((i, _)) => &s[i..],
        None => s,
    }
}

fn head_chars(s: &str, n: usize) -> &str {
    match s.char_indices().nth(n) {
        Some((i, _)) => &s[..i],
        None => s,
    }
}

fn user_prompt(before: &str, after: &str) -> String {
    format!(
        "{}<cursor/>{}",
        tail_chars(before, MAX_BEFORE),
        head_chars(after, MAX_AFTER)
    )
}

pub fn build_request(
    provider: Provider,
    model: &str,
    key: &str,
    before: &str,
    after: &str,
) -> AiRequest {
    let user = user_prompt(before, after);
    match provider {
        Provider::OpenAi => {
            let mut body = json!({
                "model": model,
                "max_completion_tokens": MAX_TOKENS,
                "messages": [
                    { "role": "system", "content": SYSTEM_PROMPT },
                    { "role": "user", "content": user },
                ],
            });
            // GPT-6 models reason by default, which is slow and spends the token
            // cap on thinking. `none` turns that off; older models reject the field.
            if model.starts_with("gpt-6") {
                body["reasoning_effort"] = json!("none");
            }
            AiRequest {
                url: OPENAI_URL,
                headers: vec![("authorization", format!("Bearer {key}"))],
                body,
            }
        }
        Provider::Anthropic => {
            let mut body = json!({
                "model": model,
                "max_tokens": MAX_TOKENS,
                "system": SYSTEM_PROMPT,
                "messages": [{ "role": "user", "content": user }],
            });
            // Haiku accepts `disabled` (Haiku 5.5 thinks by default); Opus and
            // Sonnet 5.5 reject it, so it is sent only to Haiku models.
            if model.starts_with("claude-haiku") {
                body["thinking"] = json!({ "type": "disabled" });
            }
            AiRequest {
                url: ANTHROPIC_URL,
                headers: vec![
                    ("x-api-key", key.to_string()),
                    ("anthropic-version", ANTHROPIC_VERSION.to_string()),
                ],
                body,
            }
        }
    }
}

/// The raw text of a successful reply.
pub fn parse_response(provider: Provider, body: &[u8]) -> Result<String, AiError> {
    let v: Value = serde_json::from_slice(body).map_err(|_| AiError::BadResponse)?;
    let text = match provider {
        Provider::OpenAi => {
            let message = v
                .pointer("/choices/0/message")
                .ok_or(AiError::BadResponse)?;
            // `content` is null on a refusal: no suggestion, not an error.
            match message.get("content") {
                Some(Value::String(s)) => s.clone(),
                Some(Value::Null) | None => String::new(),
                Some(_) => return Err(AiError::BadResponse),
            }
        }
        Provider::Anthropic => {
            let blocks = v
                .get("content")
                .and_then(Value::as_array)
                .ok_or(AiError::BadResponse)?;
            blocks
                .iter()
                .filter(|b| b.get("type").and_then(Value::as_str) == Some("text"))
                .filter_map(|b| b.get("text").and_then(Value::as_str))
                .collect()
        }
    };
    Ok(text)
}

/// Turns a reply into ghost text: one line, one sentence, at most
/// `MAX_OUTPUT` characters. `None` when nothing is left, including a reply
/// that starts on a new line (the ghost only continues the caret's line).
pub fn shape(raw: &str, before: &str) -> Option<String> {
    let line = raw.lines().next()?;
    // After a space the ghost must not add another one.
    let line = if before.is_empty() || before.ends_with(char::is_whitespace) {
        line.trim_start()
    } else {
        line
    };
    let mut out = String::new();
    let mut chars = line.chars().peekable();
    while let Some(c) = chars.next() {
        out.push(c);
        let ends_sentence = matches!(c, '.' | '!' | '?' | '…')
            && chars.peek().map_or(true, |n| n.is_whitespace())
            && !out.trim().is_empty();
        if ends_sentence {
            break;
        }
    }
    if out.chars().count() > MAX_OUTPUT {
        let cut = head_chars(&out, MAX_OUTPUT);
        // Stop at the last word that fits, unless that would leave nothing.
        let cut = match cut.trim_end().rfind(char::is_whitespace) {
            Some(i) if !cut[..i].trim().is_empty() => &cut[..i],
            _ => cut,
        };
        out = cut.to_string();
    }
    let out = out.trim_end();
    if out.trim().is_empty() {
        None
    } else {
        Some(out.to_string())
    }
}

fn status_error(status: u16) -> AiError {
    match status {
        401 | 403 => AiError::BadKey,
        429 => AiError::RateLimited,
        _ => AiError::Provider { status },
    }
}

// --- Keychain -------------------------------------------------------------

fn entry(provider: Provider) -> Result<keyring::Entry, AiError> {
    keyring::Entry::new(KEYCHAIN_SERVICE, provider.account()).map_err(|_| AiError::Keychain)
}

fn read_key(provider: Provider) -> Result<Option<String>, AiError> {
    match entry(provider)?.get_password() {
        Ok(k) => Ok(Some(k)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => {
            log::warn!("ai: keychain read failed: {e}");
            Err(AiError::Keychain)
        }
    }
}

fn write_key(provider: Provider, key: &str) -> Result<(), AiError> {
    entry(provider)?.set_password(key).map_err(|e| {
        log::warn!("ai: keychain write failed: {e}");
        AiError::Keychain
    })
}

fn delete_key(provider: Provider) -> Result<(), AiError> {
    match entry(provider)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => {
            log::warn!("ai: keychain delete failed: {e}");
            Err(AiError::Keychain)
        }
    }
}

// --- State and commands ---------------------------------------------------

#[derive(Default)]
struct Inner {
    /// Loaded from `ai.json` on first use.
    config: Option<AiConfig>,
    /// The last keychain lookup, so typing does not hit the keychain each pause.
    key: Option<(Provider, Option<String>)>,
}

#[derive(Default)]
pub struct AiState {
    inner: parking_lot::Mutex<Inner>,
    client: OnceLock<reqwest::Client>,
}

fn config_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("ai.json"))
}

fn load_config(app: &AppHandle) -> AiConfig {
    config_path(app)
        .and_then(|p| std::fs::read(p).ok())
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

impl Inner {
    fn config(&mut self, app: &AppHandle) -> &AiConfig {
        self.config.get_or_insert_with(|| load_config(app))
    }

    fn key(&mut self, provider: Provider) -> Result<Option<String>, AiError> {
        if let Some((p, k)) = &self.key {
            if *p == provider {
                return Ok(k.clone());
            }
        }
        let k = read_key(provider)?;
        self.key = Some((provider, k.clone()));
        Ok(k)
    }

    fn status(&mut self, app: &AppHandle) -> AiStatus {
        let config = self.config(app).clone();
        let has_key = matches!(self.key(config.provider), Ok(Some(_)));
        AiStatus {
            enabled: config.enabled,
            provider: config.provider,
            model: config.model,
            has_key,
            default_models: DefaultModels {
                openai: Provider::OpenAi.default_model(),
                anthropic: Provider::Anthropic.default_model(),
            },
        }
    }
}

#[tauri::command]
pub fn ai_status(app: AppHandle, state: State<AiState>) -> AiStatus {
    state.inner.lock().status(&app)
}

#[tauri::command]
pub fn ai_save_settings(
    app: AppHandle,
    state: State<AiState>,
    enabled: bool,
    provider: Provider,
    model: String,
) -> Result<AiStatus, AiError> {
    let config = AiConfig {
        enabled,
        provider,
        model: model.trim().to_string(),
    };
    let path = config_path(&app).ok_or(AiError::Config)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|_| AiError::Config)?;
    }
    let bytes = serde_json::to_vec_pretty(&config).map_err(|_| AiError::Config)?;
    crate::atomic_write::write_atomic(&path, &bytes).map_err(|_| AiError::Config)?;
    let mut inner = state.inner.lock();
    inner.config = Some(config);
    Ok(inner.status(&app))
}

/// Saves `key` for the chosen provider. The key is never sent back.
#[tauri::command]
pub fn ai_set_key(app: AppHandle, state: State<AiState>, key: String) -> Result<AiStatus, AiError> {
    let key = key.trim();
    if key.is_empty() {
        return Err(AiError::NoKey);
    }
    let mut inner = state.inner.lock();
    let provider = inner.config(&app).provider;
    write_key(provider, key)?;
    inner.key = Some((provider, Some(key.to_string())));
    Ok(inner.status(&app))
}

#[tauri::command]
pub fn ai_clear_key(app: AppHandle, state: State<AiState>) -> Result<AiStatus, AiError> {
    let mut inner = state.inner.lock();
    let provider = inner.config(&app).provider;
    delete_key(provider)?;
    inner.key = Some((provider, None));
    Ok(inner.status(&app))
}

/// One short continuation for the text around the caret, or `None` when the
/// model has nothing to add. Never panics: every failure is an [`AiError`].
#[tauri::command]
pub async fn ai_complete(
    app: AppHandle,
    state: State<'_, AiState>,
    before: String,
    after: String,
) -> Result<Option<String>, AiError> {
    if before.trim().is_empty() {
        return Ok(None);
    }
    let (provider, model, key) = {
        let mut inner = state.inner.lock();
        let config = inner.config(&app).clone();
        if !config.enabled {
            return Err(AiError::Off);
        }
        let key = inner.key(config.provider)?.ok_or(AiError::NoKey)?;
        (config.provider, config.model().to_string(), key)
    };
    let request = build_request(provider, &model, &key, &before, &after);
    let client = match state.client.get() {
        Some(c) => c,
        None => {
            let built = reqwest::Client::builder()
                .timeout(TIMEOUT)
                .build()
                .map_err(|_| AiError::Network)?;
            state.client.get_or_init(|| built)
        }
    };
    let mut req = client
        .post(request.url)
        .header("content-type", "application/json")
        .body(request.body.to_string());
    for (name, value) in request.headers {
        req = req.header(name, value);
    }
    let net = |e: reqwest::Error| {
        if e.is_timeout() {
            AiError::Timeout
        } else {
            AiError::Network
        }
    };
    let resp = req.send().await.map_err(net)?;
    let status = resp.status().as_u16();
    let body = resp.bytes().await.map_err(net)?;
    if !(200..300).contains(&status) {
        return Err(status_error(status));
    }
    let raw = parse_response(provider, &body)?;
    Ok(shape(&raw, &before))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn header<'a>(req: &'a AiRequest, name: &str) -> Option<&'a str> {
        req.headers
            .iter()
            .find(|(n, _)| *n == name)
            .map(|(_, v)| v.as_str())
    }

    #[test]
    fn openai_request_carries_key_model_and_caret() {
        let req = build_request(
            Provider::OpenAi,
            "gpt-6-luna",
            "sk-1",
            "Hello wor",
            "\nNext",
        );
        assert_eq!(req.url, OPENAI_URL);
        assert_eq!(header(&req, "authorization"), Some("Bearer sk-1"));
        assert_eq!(req.body["model"], "gpt-6-luna");
        assert_eq!(req.body["max_completion_tokens"], MAX_TOKENS);
        assert_eq!(req.body["reasoning_effort"], "none");
        assert_eq!(req.body["messages"][0]["role"], "system");
        assert_eq!(
            req.body["messages"][1]["content"],
            "Hello wor<cursor/>\nNext"
        );
    }

    #[test]
    fn openai_reasoning_switch_only_for_gpt6() {
        let req = build_request(Provider::OpenAi, "gpt-4.1-nano", "k", "a", "");
        assert!(req.body.get("reasoning_effort").is_none());
    }

    #[test]
    fn anthropic_request_carries_key_version_and_system() {
        let req = build_request(Provider::Anthropic, "claude-haiku-5-5", "sk-ant", "Hi", "");
        assert_eq!(req.url, ANTHROPIC_URL);
        assert_eq!(header(&req, "x-api-key"), Some("sk-ant"));
        assert_eq!(header(&req, "anthropic-version"), Some(ANTHROPIC_VERSION));
        assert!(header(&req, "authorization").is_none());
        assert_eq!(req.body["max_tokens"], MAX_TOKENS);
        assert_eq!(req.body["system"], SYSTEM_PROMPT);
        assert_eq!(req.body["thinking"]["type"], "disabled");
        assert_eq!(req.body["messages"][0]["content"], "Hi<cursor/>");
    }

    #[test]
    fn anthropic_thinking_left_alone_for_other_models() {
        let req = build_request(Provider::Anthropic, "claude-opus-5-5", "k", "a", "");
        assert!(req.body.get("thinking").is_none());
    }

    #[test]
    fn context_is_clipped_by_characters() {
        let before = "é".repeat(MAX_BEFORE + 50);
        let after = "ü".repeat(MAX_AFTER + 50);
        let req = build_request(Provider::OpenAi, "m", "k", &before, &after);
        let sent = req.body["messages"][1]["content"].as_str().unwrap();
        let (b, a) = sent.split_once("<cursor/>").unwrap();
        assert_eq!(b.chars().count(), MAX_BEFORE);
        assert_eq!(a.chars().count(), MAX_AFTER);
    }

    #[test]
    fn short_context_is_sent_whole() {
        assert_eq!(tail_chars("abc", 10), "abc");
        assert_eq!(tail_chars("abc", 2), "bc");
        assert_eq!(tail_chars("abc", 0), "");
        assert_eq!(head_chars("abc", 2), "ab");
        assert_eq!(head_chars("abc", 10), "abc");
    }

    #[test]
    fn parses_openai_reply() {
        let body = br#"{"choices":[{"index":0,"message":{"role":"assistant","content":" on the mat."},"finish_reason":"stop"}]}"#;
        assert_eq!(
            parse_response(Provider::OpenAi, body).unwrap(),
            " on the mat."
        );
    }

    #[test]
    fn openai_refusal_is_empty_not_an_error() {
        let body =
            br#"{"choices":[{"message":{"role":"assistant","content":null,"refusal":"no"}}]}"#;
        assert_eq!(parse_response(Provider::OpenAi, body).unwrap(), "");
    }

    #[test]
    fn parses_anthropic_reply_skipping_thinking_blocks() {
        let body = br#"{"type":"message","content":[{"type":"thinking","thinking":"","signature":"x"},{"type":"text","text":" sat down."}],"stop_reason":"end_turn"}"#;
        assert_eq!(
            parse_response(Provider::Anthropic, body).unwrap(),
            " sat down."
        );
    }

    #[test]
    fn malformed_replies_are_typed_errors() {
        assert_eq!(
            parse_response(Provider::OpenAi, b"not json"),
            Err(AiError::BadResponse)
        );
        assert_eq!(
            parse_response(Provider::OpenAi, br#"{"choices":[]}"#),
            Err(AiError::BadResponse)
        );
        assert_eq!(
            parse_response(Provider::Anthropic, br#"{"error":{"type":"x"}}"#),
            Err(AiError::BadResponse)
        );
    }

    #[test]
    fn statuses_map_to_typed_errors() {
        assert_eq!(status_error(401), AiError::BadKey);
        assert_eq!(status_error(403), AiError::BadKey);
        assert_eq!(status_error(429), AiError::RateLimited);
        assert_eq!(status_error(529), AiError::Provider { status: 529 });
    }

    #[test]
    fn errors_serialize_with_a_kind_tag() {
        assert_eq!(
            serde_json::to_value(AiError::BadKey).unwrap(),
            json!({ "kind": "badKey" })
        );
        assert_eq!(
            serde_json::to_value(AiError::Provider { status: 500 }).unwrap(),
            json!({ "kind": "provider", "status": 500 })
        );
    }

    #[test]
    fn shape_keeps_one_sentence_on_one_line() {
        assert_eq!(
            shape(" on the mat. Then it slept.", "The cat sat"),
            Some(" on the mat.".into())
        );
        assert_eq!(
            shape(" first line\nsecond", "x"),
            Some(" first line".into())
        );
        assert_eq!(shape("v3.2 is out. Yes", "x"), Some("v3.2 is out.".into()));
    }

    #[test]
    fn shape_drops_a_double_space_after_whitespace() {
        assert_eq!(shape("  sat down.", "The cat "), Some("sat down.".into()));
        assert_eq!(shape(" sat down.", "The cat"), Some(" sat down.".into()));
    }

    #[test]
    fn shape_caps_length_at_a_word_boundary() {
        let raw = format!(" {}", "word ".repeat(60));
        let out = shape(&raw, "x").unwrap();
        assert!(out.chars().count() <= MAX_OUTPUT);
        assert!(out.ends_with("word"));
    }

    #[test]
    fn shape_returns_none_for_blank_replies() {
        assert_eq!(shape("", "x"), None);
        assert_eq!(shape("   \n  ", "x"), None);
        assert_eq!(shape("\nA new paragraph.", "x"), None);
    }

    #[test]
    fn config_defaults_to_off_and_reads_partial_files() {
        let c: AiConfig = serde_json::from_str("{}").unwrap();
        assert!(!c.enabled);
        assert_eq!(c.model(), "gpt-6-luna");
        let c: AiConfig =
            serde_json::from_str(r#"{"enabled":true,"provider":"anthropic"}"#).unwrap();
        assert_eq!(c.provider, Provider::Anthropic);
        assert_eq!(c.model(), "claude-haiku-5-5");
    }
}
