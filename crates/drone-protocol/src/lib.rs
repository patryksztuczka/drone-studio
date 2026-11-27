#![no_std]
#![forbid(unsafe_code)]

#[cfg(feature = "alloc")]
extern crate alloc;

pub mod cobs;
pub mod frame;
pub mod messages;
pub mod safety;

pub use frame::{DecodeError, EncodeError, FrameDecoder, Integrity, decode_frame, encode_frame};
pub use messages::*;

pub const PROTOCOL_VERSION: u8 = 1;
