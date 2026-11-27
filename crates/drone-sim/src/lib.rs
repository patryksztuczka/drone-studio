#![forbid(unsafe_code)]

pub mod atmosphere;
pub mod battery;
pub mod math;
pub mod model;
pub mod propulsion;
pub mod rng;
pub mod sensors;
pub mod sim;
pub mod wind;

pub use math::{Mat3, Quat, Vec3};
pub use model::AirframeModel;
pub use sim::{RigidState, SimConfig, Simulator, Truth};
pub use wind::{Gust, Turbulence};
