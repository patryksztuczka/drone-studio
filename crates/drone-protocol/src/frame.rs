use crc::{CRC_16_IBM_3740, CRC_32_ISO_HDLC, Crc, Table};
use postcard::experimental::max_size::MaxSize;

use crate::PROTOCOL_VERSION;
use crate::cobs;
use crate::messages::{Message, MessageKind};

const CRC16: Crc<u16, Table<16>> = Crc::<u16, Table<16>>::new(&CRC_16_IBM_3740);
const CRC32: Crc<u32, Table<16>> = Crc::<u32, Table<16>>::new(&CRC_32_ISO_HDLC);
const HEADER_LEN: usize = 3;
const FLAG_CRC32: u8 = 1;
const MAX_RAW: usize = 256;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Integrity {
    Crc16,
    Crc32,
}

impl Integrity {
    pub const fn checksum_len(self) -> usize {
        match self {
            Self::Crc16 => 2,
            Self::Crc32 => 4,
        }
    }

    pub const fn for_payload(len: usize) -> Self {
        if len <= 128 { Self::Crc16 } else { Self::Crc32 }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EncodeError {
    Serialize,
    BufferTooSmall,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DecodeError {
    Cobs,
    TooShort,
    Version(u8),
    UnknownKind(u8),
    Crc,
    Overflow,
    WrongKind {
        expected: MessageKind,
        found: MessageKind,
    },
    Payload,
}

pub const fn max_frame_len<T: MaxSize>() -> usize {
    cobs::max_encoded_len(HEADER_LEN + T::POSTCARD_MAX_SIZE + 4) + 1
}

pub fn encode_frame<T: Message>(
    message: &T,
    integrity: Integrity,
    out: &mut [u8],
) -> Result<usize, EncodeError> {
    let mut raw = [0u8; MAX_RAW];
    raw[0] = PROTOCOL_VERSION;
    raw[1] = T::KIND as u8;
    raw[2] = if integrity == Integrity::Crc32 {
        FLAG_CRC32
    } else {
        0
    };
    let room = MAX_RAW - HEADER_LEN - 4;
    let payload_len = postcard::to_slice(message, &mut raw[HEADER_LEN..HEADER_LEN + room])
        .map_err(|_| EncodeError::Serialize)?
        .len();
    let body = HEADER_LEN + payload_len;
    let tail = match integrity {
        Integrity::Crc16 => {
            let c = CRC16.checksum(&raw[..body]).to_le_bytes();
            raw[body..body + 2].copy_from_slice(&c);
            2
        }
        Integrity::Crc32 => {
            let c = CRC32.checksum(&raw[..body]).to_le_bytes();
            raw[body..body + 4].copy_from_slice(&c);
            4
        }
    };
    let raw_len = body + tail;
    if out.len() < cobs::max_encoded_len(raw_len) + 1 {
        return Err(EncodeError::BufferTooSmall);
    }
    let n = cobs::encode(&raw[..raw_len], out).map_err(|_| EncodeError::BufferTooSmall)?;
    out[n] = 0;
    Ok(n + 1)
}

#[cfg(feature = "alloc")]
pub fn encode_frame_vec<T: Message>(message: &T, integrity: Integrity) -> alloc::vec::Vec<u8> {
    let mut out = alloc::vec![0u8; max_frame_len::<T>() + 8];
    let n = encode_frame(message, integrity, &mut out).unwrap_or(0);
    out.truncate(n);
    out
}

#[derive(Debug, PartialEq, Eq)]
pub struct DecodedFrame<'a> {
    pub kind: MessageKind,
    pub integrity: Integrity,
    pub payload: &'a [u8],
}

impl DecodedFrame<'_> {
    pub fn parse<T: Message>(&self) -> Result<T, DecodeError> {
        if self.kind != T::KIND {
            return Err(DecodeError::WrongKind {
                expected: T::KIND,
                found: self.kind,
            });
        }
        postcard::from_bytes(self.payload).map_err(|_| DecodeError::Payload)
    }
}

pub fn decode_frame(encoded: &mut [u8]) -> Result<DecodedFrame<'_>, DecodeError> {
    let n = cobs::decode_in_place(encoded).map_err(|_| DecodeError::Cobs)?;
    let raw = &encoded[..n];
    if raw.len() < HEADER_LEN + 2 {
        return Err(DecodeError::TooShort);
    }
    if raw[0] != PROTOCOL_VERSION {
        return Err(DecodeError::Version(raw[0]));
    }
    let integrity = if raw[2] & FLAG_CRC32 != 0 {
        Integrity::Crc32
    } else {
        Integrity::Crc16
    };
    let tail = integrity.checksum_len();
    if raw.len() < HEADER_LEN + tail {
        return Err(DecodeError::TooShort);
    }
    let body = raw.len() - tail;
    let ok = match integrity {
        Integrity::Crc16 => {
            CRC16.checksum(&raw[..body]).to_le_bytes() == [raw[body], raw[body + 1]]
        }
        Integrity::Crc32 => {
            CRC32.checksum(&raw[..body]).to_le_bytes()
                == [raw[body], raw[body + 1], raw[body + 2], raw[body + 3]]
        }
    };
    if !ok {
        return Err(DecodeError::Crc);
    }
    let kind = MessageKind::from_u8(raw[1]).ok_or(DecodeError::UnknownKind(raw[1]))?;
    Ok(DecodedFrame {
        kind,
        integrity,
        payload: &encoded[HEADER_LEN..body],
    })
}

pub struct FrameDecoder<const N: usize> {
    buf: [u8; N],
    len: usize,
    overflowed: bool,
}

impl<const N: usize> Default for FrameDecoder<N> {
    fn default() -> Self {
        Self::new()
    }
}

impl<const N: usize> FrameDecoder<N> {
    pub const fn new() -> Self {
        Self {
            buf: [0; N],
            len: 0,
            overflowed: false,
        }
    }

    pub fn push(&mut self, byte: u8) -> Option<Result<DecodedFrame<'_>, DecodeError>> {
        if byte != 0 {
            if self.len < N {
                self.buf[self.len] = byte;
                self.len += 1;
            } else {
                self.overflowed = true;
            }
            return None;
        }
        let len = core::mem::replace(&mut self.len, 0);
        if core::mem::replace(&mut self.overflowed, false) {
            return Some(Err(DecodeError::Overflow));
        }
        if len == 0 {
            return None;
        }
        Some(decode_frame(&mut self.buf[..len]))
    }
}

#[cfg(test)]
mod tests {
    extern crate std;
    use std::vec::Vec;

    use super::*;
    use crate::messages::*;

    fn sample_step(i: u32) -> SimStepInput {
        SimStepInput {
            step: i,
            time_us: u64::from(i) * 1000,
            dt_us: 1000,
            imu: ImuRaw {
                seq: i,
                gyro: [i as i16, -(i as i16), 0],
                accel: [0, 0, 2048],
            },
            baro: BaroReading {
                seq: i / 20,
                pressure_pa: 99_888.5,
                temperature_c: 21.25,
            },
            battery: BatteryAdc {
                vbat_raw: 13_000,
                current_raw: 4_000,
            },
            rc: RcSticks {
                roll: 0.1,
                pitch: -0.2,
                yaw: 0.0,
                throttle: 0.5,
                arm: true,
                mode: FlightModeRequest::AltHold,
                valid: true,
            },
            faults: fault_flags::WIND_GUST,
        }
    }

    fn rng(state: &mut u64) -> u64 {
        *state ^= *state << 13;
        *state ^= *state >> 7;
        *state ^= *state << 17;
        *state
    }

    fn round_trip<T: Message + PartialEq + core::fmt::Debug>(m: &T, integrity: Integrity) {
        let mut buf = [0u8; 600];
        let n = encode_frame(m, integrity, &mut buf).unwrap();
        assert!(n <= max_frame_len::<T>(), "{n} > {}", max_frame_len::<T>());
        assert_eq!(buf[n - 1], 0);
        assert!(!buf[..n - 1].contains(&0));
        let decoded = decode_frame(&mut buf[..n - 1]).unwrap();
        assert_eq!(decoded.kind, T::KIND);
        assert_eq!(decoded.integrity, integrity);
        assert_eq!(&decoded.parse::<T>().unwrap(), m);
    }

    #[test]
    fn every_message_round_trips_with_both_checksums() {
        let mut out = ActuatorOutput {
            step: 7,
            time_us: 7000,
            motors: [0.4, 0.5, 0.6, 0.7],
            arm_state: ArmState::Armed,
            status: status_flags::GYRO_CALIBRATED | status_flags::ALT_HOLD,
            ..ActuatorOutput::default()
        };
        out.push_log(LogRecord {
            time_us: 7000,
            level: LogLevel::Warn,
            code: LogCode::MotorSaturation,
            args: [2, -1],
        });
        let telemetry = TelemetryFrame {
            seq: 3,
            time_us: 50_000,
            attitude: [1.0, 0.0, 0.0, 0.0],
            rotor_rpm: [21_000, 21_100, 20_900, 21_050],
            battery_v: 7.9,
            arm_state: ArmState::Failsafe,
            ..TelemetryFrame::default()
        };
        let cmd = CommandEnvelope {
            request_id: 9,
            command: GroundCommand::ScenarioLoad {
                id: ScenarioId::new("03_wind_gust_6ms").unwrap(),
                seed: 42,
            },
        };
        let reply = ReplyEnvelope {
            request_id: 9,
            reply: GroundReply::Identity {
                protocol: 1,
                imu_who_am_i: 0x47,
                baro_chip_id: 0x60,
                firmware_hash: 0xDEAD_BEEF,
            },
        };
        for integrity in [Integrity::Crc16, Integrity::Crc32] {
            round_trip(&sample_step(1234), integrity);
            round_trip(&out, integrity);
            round_trip(&telemetry, integrity);
            round_trip(&cmd, integrity);
            round_trip(&reply, integrity);
        }
        assert_eq!(
            cmd.command,
            GroundCommand::ScenarioLoad {
                id: ScenarioId::new("03_wind_gust_6ms").unwrap(),
                seed: 42
            }
        );
    }

    #[test]
    fn randomized_round_trips() {
        let mut s = 0x1234_5678_9ABC_DEF0;
        for _ in 0..2000 {
            let mut m = sample_step(rng(&mut s) as u32);
            m.imu.gyro = [rng(&mut s) as i16, rng(&mut s) as i16, rng(&mut s) as i16];
            m.imu.accel = [rng(&mut s) as i16, rng(&mut s) as i16, rng(&mut s) as i16];
            m.time_us = rng(&mut s);
            m.baro.pressure_pa = f32::from_bits(rng(&mut s) as u32 & 0x7F7F_FFFF);
            m.rc.arm = rng(&mut s) & 1 == 0;
            m.faults = rng(&mut s) as u16;
            let integrity = if rng(&mut s) & 1 == 0 {
                Integrity::Crc16
            } else {
                Integrity::Crc32
            };
            round_trip(&m, integrity);
        }
    }

    #[test]
    fn decoder_resynchronizes_after_corruption() {
        let mut stream = Vec::new();
        let mut buf = [0u8; 256];
        for i in 0..3 {
            let n = encode_frame(&sample_step(i), Integrity::Crc16, &mut buf).unwrap();
            stream.extend_from_slice(&buf[..n]);
        }
        let first_end = stream.iter().position(|b| *b == 0).unwrap();
        stream[first_end + 5] ^= 0x5A;
        stream.splice(0..0, [0x13, 0x37, 0x42]);
        let mut decoder = FrameDecoder::<256>::new();
        let mut good = Vec::new();
        let mut errors = 0;
        for b in stream {
            match decoder.push(b) {
                Some(Ok(frame)) => good.push(frame.parse::<SimStepInput>().unwrap().step),
                Some(Err(_)) => errors += 1,
                None => {}
            }
        }
        assert_eq!(good, [2]);
        assert_eq!(errors, 2);
    }

    #[test]
    fn single_bit_flips_are_detected() {
        let mut buf = [0u8; 256];
        let n = encode_frame(&sample_step(77), Integrity::Crc16, &mut buf).unwrap();
        for pos in 0..n - 1 {
            for bit in 0..8 {
                let mut copy = buf;
                copy[pos] ^= 1 << bit;
                if copy[pos] == 0 {
                    continue;
                }
                let r = decode_frame(&mut copy[..n - 1]);
                if let Ok(f) = r {
                    assert_ne!(
                        f.parse::<SimStepInput>().ok(),
                        Some(sample_step(77)),
                        "flip at {pos}:{bit} undetected"
                    );
                }
            }
        }
    }

    #[test]
    fn oversized_frames_are_dropped_without_losing_the_next() {
        let mut decoder = FrameDecoder::<64>::new();
        for _ in 0..200 {
            assert!(decoder.push(0xAA).is_none());
        }
        assert_eq!(
            decoder.push(0).map(|r| r.err()),
            Some(Some(DecodeError::Overflow))
        );
        let mut buf = [0u8; 64];
        let cmd = CommandEnvelope {
            request_id: 1,
            command: GroundCommand::Ping { nonce: 5 },
        };
        let n = encode_frame(&cmd, Integrity::Crc16, &mut buf).unwrap();
        let mut got = None;
        for b in &buf[..n] {
            if let Some(Ok(f)) = decoder.push(*b) {
                got = Some(f.parse::<CommandEnvelope>().unwrap());
            }
        }
        assert_eq!(got, Some(cmd));
    }

    #[test]
    fn max_frame_sizes_are_bounded() {
        assert!(
            max_frame_len::<SimStepInput>() <= 96,
            "{}",
            max_frame_len::<SimStepInput>()
        );
        assert!(
            max_frame_len::<ActuatorOutput>() <= 160,
            "{}",
            max_frame_len::<ActuatorOutput>()
        );
        assert!(
            max_frame_len::<TelemetryFrame>() <= 160,
            "{}",
            max_frame_len::<TelemetryFrame>()
        );
        assert!(max_frame_len::<CommandEnvelope>() <= 64);
        assert!(max_frame_len::<ReplyEnvelope>() <= 64);
    }

    #[test]
    fn wrong_kind_is_reported() {
        let mut buf = [0u8; 128];
        let n = encode_frame(&sample_step(1), Integrity::Crc16, &mut buf).unwrap();
        let f = decode_frame(&mut buf[..n - 1]).unwrap();
        assert!(matches!(
            f.parse::<ActuatorOutput>(),
            Err(DecodeError::WrongKind { .. })
        ));
    }
}
