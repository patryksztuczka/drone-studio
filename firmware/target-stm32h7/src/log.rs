use core::fmt::{self, Write};

use embassy_stm32::mode::Blocking;
use embassy_stm32::usart::UartTx;

pub struct Log<'d> {
    tx: UartTx<'d, Blocking>,
}

impl<'d> Log<'d> {
    pub fn new(tx: UartTx<'d, Blocking>) -> Self {
        Self { tx }
    }

    pub fn line(&mut self, args: fmt::Arguments<'_>) {
        let _ = self.write_fmt(args);
        let _ = self.write_str("\r\n");
        let _ = self.tx.blocking_flush();
    }
}

impl Write for Log<'_> {
    fn write_str(&mut self, s: &str) -> fmt::Result {
        self.tx.blocking_write(s.as_bytes()).map_err(|_| fmt::Error)
    }
}
