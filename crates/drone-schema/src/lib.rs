#![forbid(unsafe_code)]

pub mod check;
pub mod codegen;
pub mod diagnostics;
pub mod load;
pub mod manifest;
pub mod resolve;

use std::path::Path;

pub use diagnostics::{Diagnostic, Diagnostics, Severity};
pub use load::Repository;

pub fn validate(root: &Path) -> (Repository, Diagnostics) {
    let (repo, mut diags) = load::load(root);
    if !diags.has_errors() || !repo.airframes.is_empty() {
        check::check(&repo, &mut diags);
    }
    (repo, diags)
}
