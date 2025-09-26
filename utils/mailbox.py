from antmicro.renode.core import *
from antmicro.renode.peripherals import *

class BCM2835Mailbox(PythonPeripheral):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.temperature = 25.0
        self.read_status = 0x40000000  # empty
        self.read_value = 0

    def Reset(self):
        self.temperature = 25.0
        self.read_status = 0x40000000

    def ReadDoubleWord(self, offset):
        if offset == 0x0:  # READ
            value = self.read_value
            self.read_status = 0x40000000  # empty after read
            return value
        elif offset == 0x18:  # STATUS
            return self.read_status
        elif offset == 0x10:  # PEEK
            return self.read_value
        elif offset == 0x14:  # SENDER
            return 0
        elif offset == 0x1C:  # CONFIG
            return 0
        return 0

    def WriteDoubleWord(self, offset, value):
        if offset == 0x20:  # WRITE
            channel = value & 0xF
            buffer_addr = value >> 4
            if channel == 8:
                self._process_property_buffer(buffer_addr)
            self.read_value = value
            self.read_status = 0x0  # not empty
        elif offset == 0x1C:  # CONFIG
            pass

    def _process_property_buffer(self, buffer_addr):
        self.Machine.SystemBus.Write32(buffer_addr + 4, 0x80000000)
        pos = 8
        while True:
            tag = self.Machine.SystemBus.Read32(buffer_addr + pos)
            if tag == 0:
                break
            pos += 4
            value_size = self.Machine.SystemBus.Read32(buffer_addr + pos)
            pos += 4
            code_pos = pos
            pos += 4
            value_pos = pos
            pos += (((value_size + 3) // 4) * 4)
            code = self.Machine.SystemBus.Read32(buffer_addr + code_pos)
            if code == 0:
                self.Machine.SystemBus.Write32(buffer_addr + code_pos, 0x80000000 | value_size)
                if tag == 0x00030006:  # get temperature
                    self.Machine.SystemBus.Write32(buffer_addr + value_pos + 4, int(self.temperature * 1000))