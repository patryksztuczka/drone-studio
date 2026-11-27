use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Error,
    Warning,
}

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub struct Diagnostic {
    pub severity: Severity,
    pub code: String,
    pub file: String,
    pub path: String,
    pub message: String,
}

impl Diagnostic {
    pub fn error(code: &str, file: &str, path: &str, message: impl Into<String>) -> Self {
        Self {
            severity: Severity::Error,
            code: code.to_owned(),
            file: file.to_owned(),
            path: path.to_owned(),
            message: message.into(),
        }
    }

    pub fn warning(code: &str, file: &str, path: &str, message: impl Into<String>) -> Self {
        Self {
            severity: Severity::Warning,
            ..Self::error(code, file, path, message)
        }
    }
}

impl core::fmt::Display for Diagnostic {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        let level = match self.severity {
            Severity::Error => "error",
            Severity::Warning => "warning",
        };
        let path = if self.path.is_empty() {
            "/"
        } else {
            &self.path
        };
        write!(
            f,
            "{level}[{}] {}:{} {}",
            self.code, self.file, path, self.message
        )
    }
}

#[derive(Debug, Default)]
pub struct Diagnostics {
    pub items: Vec<Diagnostic>,
}

impl Diagnostics {
    pub fn push(&mut self, d: Diagnostic) {
        self.items.push(d);
    }

    pub fn error(&mut self, code: &str, file: &str, path: &str, message: impl Into<String>) {
        self.push(Diagnostic::error(code, file, path, message));
    }

    pub fn warning(&mut self, code: &str, file: &str, path: &str, message: impl Into<String>) {
        self.push(Diagnostic::warning(code, file, path, message));
    }

    pub fn has_errors(&self) -> bool {
        self.items.iter().any(|d| d.severity == Severity::Error)
    }

    pub fn error_count(&self) -> usize {
        self.items
            .iter()
            .filter(|d| d.severity == Severity::Error)
            .count()
    }

    pub fn warning_count(&self) -> usize {
        self.items
            .iter()
            .filter(|d| d.severity == Severity::Warning)
            .count()
    }

    pub fn sorted(mut self) -> Vec<Diagnostic> {
        self.items.sort();
        self.items.dedup();
        self.items
    }
}
