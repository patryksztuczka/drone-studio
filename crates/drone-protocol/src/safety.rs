use crate::messages::GroundCommand;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Link {
    Sim,
    Emu,
    Real,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum CommandClass {
    ReadOnly,
    Configure,
    Actuate,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct SafetyPolicy {
    pub real_hardware_writes_unlocked: bool,
}

pub const fn classify(command: &GroundCommand) -> CommandClass {
    match command {
        GroundCommand::Ping { .. }
        | GroundCommand::ParamRead { .. }
        | GroundCommand::ParamCount
        | GroundCommand::Bench(_) => CommandClass::ReadOnly,
        GroundCommand::ParamWrite { .. }
        | GroundCommand::ScenarioLoad { .. }
        | GroundCommand::ScenarioStart
        | GroundCommand::ScenarioPause
        | GroundCommand::ScenarioReset
        | GroundCommand::SetPlaybackSpeed { .. } => CommandClass::Configure,
        GroundCommand::Arm | GroundCommand::Disarm | GroundCommand::MotorTest { .. } => {
            CommandClass::Actuate
        }
    }
}

pub const fn is_allowed(command: &GroundCommand, link: Link, policy: SafetyPolicy) -> bool {
    match (link, classify(command)) {
        (Link::Sim | Link::Emu, _) | (Link::Real, CommandClass::ReadOnly) => true,
        (Link::Real, CommandClass::Configure) => policy.real_hardware_writes_unlocked,
        (Link::Real, CommandClass::Actuate) => matches!(command, GroundCommand::Disarm),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::messages::BenchQuery;

    #[test]
    fn real_hardware_is_read_only_by_default() {
        let p = SafetyPolicy::default();
        assert!(is_allowed(
            &GroundCommand::Bench(BenchQuery::Identity),
            Link::Real,
            p
        ));
        assert!(is_allowed(
            &GroundCommand::ParamRead { id: 1 },
            Link::Real,
            p
        ));
        assert!(!is_allowed(
            &GroundCommand::ParamWrite { id: 1, value: 0.1 },
            Link::Real,
            p
        ));
        assert!(!is_allowed(&GroundCommand::Arm, Link::Real, p));
        assert!(!is_allowed(
            &GroundCommand::MotorTest {
                motor: 0,
                command_permille: 100,
                duration_ms: 100
            },
            Link::Real,
            SafetyPolicy {
                real_hardware_writes_unlocked: true
            }
        ));
        assert!(is_allowed(&GroundCommand::Disarm, Link::Real, p));
    }

    #[test]
    fn simulation_allows_everything() {
        let p = SafetyPolicy::default();
        assert!(is_allowed(&GroundCommand::Arm, Link::Sim, p));
        assert!(is_allowed(
            &GroundCommand::ParamWrite { id: 1, value: 0.1 },
            Link::Emu,
            p
        ));
    }
}
