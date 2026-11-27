use std::time::Instant;

use drone_protocol::*;

fn main() {
    let msg = SimStepInput::default();
    let out = ActuatorOutput::default();
    let mut buf = [0u8; 300];
    let n = 200_000;
    let t = Instant::now();
    for i in 0..n {
        let mut m = msg;
        m.step = i;
        let len = encode_frame(&m, Integrity::Crc16, &mut buf).expect("test fixture");
        std::hint::black_box(len);
    }
    println!(
        "encode step: {:.0} ns",
        t.elapsed().as_nanos() as f64 / f64::from(n)
    );
    let len = encode_frame(&msg, Integrity::Crc16, &mut buf).expect("test fixture");
    let t = Instant::now();
    for _ in 0..n {
        let mut b = buf;
        let f = decode_frame(&mut b[..len - 1]).expect("test fixture");
        std::hint::black_box(f.parse::<SimStepInput>().expect("test fixture"));
    }
    println!(
        "decode step: {:.0} ns",
        t.elapsed().as_nanos() as f64 / f64::from(n)
    );
    let t = Instant::now();
    for _ in 0..n {
        std::hint::black_box(encode_frame(&out, Integrity::Crc16, &mut buf).expect("test fixture"));
    }
    println!(
        "encode out: {:.0} ns",
        t.elapsed().as_nanos() as f64 / f64::from(n)
    );
}
