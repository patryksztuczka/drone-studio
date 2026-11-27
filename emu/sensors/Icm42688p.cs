using System;

using Antmicro.Renode.Core;
using Antmicro.Renode.Exceptions;
using Antmicro.Renode.Logging;
using Antmicro.Renode.Peripherals.SPI;

namespace Antmicro.Renode.Peripherals.Sensors
{
    public class ICM42688P : ISPIPeripheral, IGPIOReceiver
    {
        public ICM42688P()
        {
            Reset();
        }

        public void Reset()
        {
            ResetRegisters();
            accel = new short[] { 0, 0, 2048 };
            gyro = new short[] { 0, 0, 0 };
            WhoAmIReads = 0;
            DataReads = 0;
            RegisterWrites = 0;
            SoftResets = 0;
            Transactions = 0;
            chipSelected = false;
            BeginTransaction();
        }

        public void OnGPIO(int number, bool value)
        {
            if(number != 0)
            {
                return;
            }
            var selected = !value;
            if(selected == chipSelected)
            {
                return;
            }
            chipSelected = selected;
            if(selected)
            {
                Transactions++;
            }
            BeginTransaction();
        }

        public void FinishTransmission()
        {
            BeginTransaction();
        }

        public byte Transmit(byte data)
        {
            if(expectAddress)
            {
                expectAddress = false;
                reading = (data & ReadBit) != 0;
                address = (byte)(data & AddressMask);
                if(reading)
                {
                    CountRead(address);
                }
                return 0;
            }

            if(reading)
            {
                var value = ReadRegister(address);
                address = (byte)((address + 1) & AddressMask);
                return value;
            }

            WriteRegister(address, data);
            address = (byte)((address + 1) & AddressMask);
            return 0;
        }

        public void SetAccelRaw(short x, short y, short z)
        {
            accel = new short[] { x, y, z };
        }

        public void SetGyroRaw(short x, short y, short z)
        {
            gyro = new short[] { x, y, z };
        }

        public void SetAccelG(decimal x, decimal y, decimal z)
        {
            var lsb = AccelLsbPerG();
            SetAccelRaw(ToRaw(x * lsb), ToRaw(y * lsb), ToRaw(z * lsb));
        }

        public void SetGyroDps(decimal x, decimal y, decimal z)
        {
            var lsb = GyroLsbPerDps();
            SetGyroRaw(ToRaw(x * lsb), ToRaw(y * lsb), ToRaw(z * lsb));
        }

        public string Accel => $"{accel[0]} {accel[1]} {accel[2]}";

        public string Gyro => $"{gyro[0]} {gyro[1]} {gyro[2]}";

        public byte PowerManagement => bank0[PwrMgmt0];

        public byte GyroConfig => bank0[GyroConfig0];

        public byte AccelConfig => bank0[AccelConfig0];

        public bool Measuring => (bank0[PwrMgmt0] & 0x0F) != 0;

        public ulong WhoAmIReads { get; private set; }

        public ulong DataReads { get; private set; }

        public ulong RegisterWrites { get; private set; }

        public ulong SoftResets { get; private set; }

        public ulong Transactions { get; private set; }

        private void ResetRegisters()
        {
            Array.Clear(bank0, 0, bank0.Length);
            bank0[WhoAmI] = WhoAmIValue;
            bank0[GyroConfig0] = 0x06;
            bank0[AccelConfig0] = 0x06;
        }

        private void BeginTransaction()
        {
            expectAddress = true;
            reading = false;
            address = 0;
        }

        private void CountRead(byte register)
        {
            if(register == WhoAmI)
            {
                WhoAmIReads++;
            }
            else if(register >= TempData1 && register <= GyroDataZ0)
            {
                DataReads++;
            }
        }

        private byte ReadRegister(byte register)
        {
            if(register >= AccelDataX1 && register <= GyroDataZ0)
            {
                var offset = register - AccelDataX1;
                var source = offset < 6 ? accel : gyro;
                var axis = (offset % 6) / 2;
                var value = Measuring ? source[axis] : (short)-32768;
                return (offset & 1) == 0 ? (byte)((value >> 8) & 0xFF) : (byte)(value & 0xFF);
            }
            if(register == TempData1 || register == TempData0)
            {
                return 0;
            }
            if(register == IntStatus)
            {
                return Measuring ? DataReadyFlag : (byte)0;
            }
            return bank0[register];
        }

        private void WriteRegister(byte register, byte value)
        {
            RegisterWrites++;
            switch(register)
            {
            case WhoAmI:
                return;
            case DeviceConfig:
                if((value & SoftResetBit) != 0)
                {
                    SoftResets++;
                    this.Log(LogLevel.Debug, "Soft reset");
                    ResetRegisters();
                    return;
                }
                bank0[register] = value;
                return;
            default:
                bank0[register] = value;
                return;
            }
        }

        private decimal AccelLsbPerG()
        {
            switch((bank0[AccelConfig0] >> 5) & 0x7)
            {
            case 0: return 2048m;
            case 1: return 4096m;
            case 2: return 8192m;
            case 3: return 16384m;
            default:
                throw new RecoverableException("ACCEL_FS_SEL holds a reserved value");
            }
        }

        private decimal GyroLsbPerDps()
        {
            switch((bank0[GyroConfig0] >> 5) & 0x7)
            {
            case 0: return 16.4m;
            case 1: return 32.8m;
            case 2: return 65.5m;
            case 3: return 131m;
            case 4: return 262m;
            case 5: return 524.3m;
            case 6: return 1048.6m;
            default: return 2097.2m;
            }
        }

        private static short ToRaw(decimal value)
        {
            var rounded = Math.Round(value);
            if(rounded > short.MaxValue)
            {
                return short.MaxValue;
            }
            if(rounded < short.MinValue + 1)
            {
                return short.MinValue + 1;
            }
            return (short)rounded;
        }

        private readonly byte[] bank0 = new byte[0x80];
        private short[] accel;
        private short[] gyro;
        private bool chipSelected;
        private bool expectAddress;
        private bool reading;
        private byte address;

        private const byte ReadBit = 0x80;
        private const byte AddressMask = 0x7F;
        private const byte SoftResetBit = 0x01;
        private const byte DataReadyFlag = 0x08;
        private const byte WhoAmIValue = 0x47;

        private const byte DeviceConfig = 0x11;
        private const byte TempData1 = 0x1D;
        private const byte TempData0 = 0x1E;
        private const byte AccelDataX1 = 0x1F;
        private const byte GyroDataZ0 = 0x2A;
        private const byte IntStatus = 0x2D;
        private const byte PwrMgmt0 = 0x4E;
        private const byte GyroConfig0 = 0x4F;
        private const byte AccelConfig0 = 0x50;
        private const byte WhoAmI = 0x75;
    }
}
