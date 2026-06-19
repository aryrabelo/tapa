//! Query / set Tapa as the default macOS handler for the standard Markdown
//! content type `net.daringfireball.markdown` via LaunchServices.
//!
//! The LaunchServices role-handler APIs (`LSCopyDefaultRoleHandlerForContentType`
//! / `LSSetDefaultRoleHandlerForContentType`) are deprecated since macOS 12 but
//! remain the only public C entry points for binding a content type to an app;
//! the non-deprecated replacement (`NSWorkspace.setDefaultApplication`) is
//! ObjC/Swift-only and async. They still work on current macOS.
//!
//! Only macOS is supported: there is no cross-desktop notion of a per-UTI
//! default handler, so other targets return a clear error / `false`.

/// Standard Daring Fireball Markdown UTI (also exported by many editors).
#[cfg(target_os = "macos")]
const MARKDOWN_UTI: &str = "net.daringfireball.markdown";
/// Tapa's bundle identifier (matches tauri.conf.json `identifier`).
#[cfg(target_os = "macos")]
const BUNDLE_ID: &str = "com.aryrabelo.tapa";

#[cfg(target_os = "macos")]
mod imp {
    use super::{BUNDLE_ID, MARKDOWN_UTI};
    use core_foundation::base::TCFType;
    use core_foundation::string::{CFString, CFStringRef};

    /// `LSRolesMask` bit for an editor handler (`kLSRolesEditor`).
    const K_LS_ROLES_EDITOR: u32 = 0x0000_0004;

    #[link(name = "CoreServices", kind = "framework")]
    extern "C" {
        fn LSCopyDefaultRoleHandlerForContentType(
            in_content_type: CFStringRef,
            in_role: u32,
        ) -> CFStringRef;
        fn LSSetDefaultRoleHandlerForContentType(
            in_content_type: CFStringRef,
            in_role: u32,
            in_handler_bundle_id: CFStringRef,
        ) -> i32; // OSStatus
    }

    pub fn is_default() -> bool {
        let uti = CFString::new(MARKDOWN_UTI);
        // SAFETY: `uti` outlives the call; the returned ref follows the Copy
        // (Create) ownership rule, so wrap_under_create_rule takes the +1 retain
        // and releases it on drop. A null result means "no registered handler".
        unsafe {
            let handler_ref = LSCopyDefaultRoleHandlerForContentType(
                uti.as_concrete_TypeRef(),
                K_LS_ROLES_EDITOR,
            );
            if handler_ref.is_null() {
                return false;
            }
            let handler = CFString::wrap_under_create_rule(handler_ref);
            handler.to_string().eq_ignore_ascii_case(BUNDLE_ID)
        }
    }

    pub fn set_default() -> Result<(), String> {
        let uti = CFString::new(MARKDOWN_UTI);
        let bundle = CFString::new(BUNDLE_ID);
        // SAFETY: both CFStrings outlive the synchronous call; no ownership is
        // transferred (the args are borrowed, not consumed by LaunchServices).
        let status = unsafe {
            LSSetDefaultRoleHandlerForContentType(
                uti.as_concrete_TypeRef(),
                K_LS_ROLES_EDITOR,
                bundle.as_concrete_TypeRef(),
            )
        };
        if status == 0 {
            Ok(())
        } else {
            Err(format!(
                "LSSetDefaultRoleHandlerForContentType returned OSStatus {status} for {MARKDOWN_UTI}"
            ))
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod imp {
    /// No per-UTI default-handler concept off macOS: report "not default".
    pub fn is_default() -> bool {
        false
    }

    pub fn set_default() -> Result<(), String> {
        Err("Setting the default Markdown handler is only supported on macOS".to_string())
    }
}

/// Whether Tapa is currently the default editor for `net.daringfireball.markdown`.
pub fn is_default() -> bool {
    imp::is_default()
}

/// Register Tapa as the default editor for `net.daringfireball.markdown`.
pub fn set_default() -> Result<(), String> {
    imp::set_default()
}
