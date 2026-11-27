#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CobsError {
    OutputTooSmall,
    Malformed,
}

pub const fn max_encoded_len(source_len: usize) -> usize {
    source_len + source_len / 254 + 1
}

pub fn encode(source: &[u8], out: &mut [u8]) -> Result<usize, CobsError> {
    if out.len() < max_encoded_len(source.len()) {
        return Err(CobsError::OutputTooSmall);
    }
    let mut code_index = 0;
    let mut write = 1;
    let mut code: u8 = 1;
    for &byte in source {
        if byte == 0 {
            out[code_index] = code;
            code_index = write;
            write += 1;
            code = 1;
        } else {
            out[write] = byte;
            write += 1;
            code += 1;
            if code == 0xFF {
                out[code_index] = code;
                code_index = write;
                write += 1;
                code = 1;
            }
        }
    }
    out[code_index] = code;
    Ok(write)
}

pub fn decode_in_place(buf: &mut [u8]) -> Result<usize, CobsError> {
    let mut read = 0;
    let mut write = 0;
    while read < buf.len() {
        let code = buf[read] as usize;
        if code == 0 {
            return Err(CobsError::Malformed);
        }
        read += 1;
        let end = read + code - 1;
        if end > buf.len() {
            return Err(CobsError::Malformed);
        }
        while read < end {
            buf[write] = buf[read];
            write += 1;
            read += 1;
        }
        if code != 0xFF && read < buf.len() {
            buf[write] = 0;
            write += 1;
        }
    }
    Ok(write)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn round_trip(data: &[u8]) {
        let mut enc = [0u8; 1024];
        let n = encode(data, &mut enc).unwrap();
        assert!(!enc[..n].contains(&0));
        assert!(n <= max_encoded_len(data.len()));
        let mut dec = [0u8; 1024];
        dec[..n].copy_from_slice(&enc[..n]);
        let m = decode_in_place(&mut dec[..n]).unwrap();
        assert_eq!(&dec[..m], data);
    }

    #[test]
    fn known_vectors() {
        let mut out = [0u8; 16];
        let n = encode(&[0x11, 0x22, 0x00, 0x33], &mut out).unwrap();
        assert_eq!(&out[..n], &[0x03, 0x11, 0x22, 0x02, 0x33]);
        let n = encode(&[0x00], &mut out).unwrap();
        assert_eq!(&out[..n], &[0x01, 0x01]);
    }

    #[test]
    fn round_trips() {
        round_trip(&[]);
        round_trip(&[0]);
        round_trip(&[0, 0, 0]);
        let long: [u8; 600] = core::array::from_fn(|i| (i % 255) as u8 + 1);
        round_trip(&long);
        let mixed: [u8; 600] = core::array::from_fn(|i| (i * 7 % 256) as u8);
        round_trip(&mixed);
    }
}
