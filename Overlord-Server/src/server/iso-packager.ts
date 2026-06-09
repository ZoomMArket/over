import * as fs from "fs";
import * as path from "path";

/**
 * Creates a minimal ISO 9660 image containing a single file.
 * Files inside an ISO lose their Mark of the Web (MOTW) when mounted
 * in Windows 10/11, bypassing SmartScreen.
 *
 * This is a minimal ISO 9660 Level 1 implementation — no Joliet, no Rock Ridge.
 * Just enough to be mountable by Windows Explorer.
 */
export function createISO(
  inputFilePath: string,
  outputIsoPath: string,
  filenameInIso?: string,
): void {
  const fileData = fs.readFileSync(inputFilePath);
  const fileName = (filenameInIso || path.basename(inputFilePath)).toUpperCase();

  // ISO 9660 uses 2048-byte sectors
  const SECTOR = 2048;

  // Layout: 16 system sectors + 1 PVD + 1 terminator + 1 root dir + 1 path table + file data
  const fileSectors = Math.ceil(fileData.length / SECTOR);
  const FILE_START_SECTOR = 20; // give room for metadata
  const totalSectors = FILE_START_SECTOR + fileSectors;
  const iso = Buffer.alloc(totalSectors * SECTOR);

  // --- Primary Volume Descriptor at sector 16 ---
  const pvd = iso.subarray(16 * SECTOR, 17 * SECTOR);
  pvd[0] = 1; // PVD type
  pvd.write("CD001", 1, "ascii"); // standard ID
  pvd[6] = 1; // version
  writeBothEndian32(pvd, 80, totalSectors); // volume space size
  writeBothEndian16(pvd, 120, 1); // volume set size
  writeBothEndian16(pvd, 124, 1); // volume sequence number
  writeBothEndian16(pvd, 128, SECTOR); // logical block size

  // path table size (10 bytes for root)
  writeBothEndian32(pvd, 132, 10);
  pvd.writeUInt32LE(18, 140); // L path table location
  pvd.writeUInt32BE(18, 148); // M path table location

  // Root directory record (34 bytes at offset 156)
  const rootRec = pvd.subarray(156, 190);
  rootRec[0] = 34; // record length
  rootRec[2] = 19; // extent location LE
  rootRec[5] = 19; // extent location BE (byte-swapped manual)
  writeBothEndian32(rootRec, 2, 19); // location of extent
  writeBothEndian32(rootRec, 10, SECTOR); // data length
  rootRec[25] = 2; // flags: directory
  rootRec[28] = 1; // file identifier length
  rootRec[32] = 0; // root identifier (0x00)

  // Set recording date (just zeros = 1900-01-01, acceptable)
  pvd[813] = 1; // file structure version

  // --- Volume Descriptor Set Terminator at sector 17 ---
  const term = iso.subarray(17 * SECTOR, 18 * SECTOR);
  term[0] = 255; // terminator type
  term.write("CD001", 1, "ascii");
  term[6] = 1;

  // --- Path Table at sector 18 ---
  const pt = iso.subarray(18 * SECTOR, 19 * SECTOR);
  pt[0] = 1; // name length
  pt[2] = 19; // extent location (LE)
  pt.writeUInt16LE(1, 6); // dir number of parent
  pt[8] = 0; // root name (0x00)

  // --- Root Directory at sector 19 ---
  const dir = iso.subarray(19 * SECTOR, 20 * SECTOR);
  let offset = 0;

  // "." entry
  dir[offset] = 34;
  writeBothEndian32(dir, offset + 2, 19);
  writeBothEndian32(dir, offset + 10, SECTOR);
  dir[offset + 25] = 2;
  dir[offset + 28] = 1; // name length
  dir[offset + 32] = 0; // name = 0x00
  offset += 34;

  // ".." entry
  dir[offset] = 34;
  writeBothEndian32(dir, offset + 2, 19);
  writeBothEndian32(dir, offset + 10, SECTOR);
  dir[offset + 25] = 2;
  dir[offset + 28] = 1;
  dir[offset + 32] = 1; // name = 0x01
  offset += 34;

  // File entry
  const iso9660Name = toISO9660Name(fileName);
  const nameBytes = Buffer.from(iso9660Name + ";1", "ascii");
  const fileRecLen = 33 + nameBytes.length + (nameBytes.length % 2 === 0 ? 1 : 0);
  dir[offset] = fileRecLen;
  writeBothEndian32(dir, offset + 2, FILE_START_SECTOR);
  writeBothEndian32(dir, offset + 10, fileData.length);
  dir[offset + 25] = 0; // flags: regular file
  dir[offset + 28] = 1; // interleave
  writeBothEndian16(dir, offset + 28, 1); // volume sequence
  dir[offset + 32] = nameBytes.length;
  nameBytes.copy(dir, offset + 33);

  // --- File data starting at FILE_START_SECTOR ---
  fileData.copy(iso, FILE_START_SECTOR * SECTOR);

  fs.writeFileSync(outputIsoPath, iso);
}

function writeBothEndian32(buf: Buffer, offset: number, value: number) {
  buf.writeUInt32LE(value, offset);
  buf.writeUInt32BE(value, offset + 4);
}

function writeBothEndian16(buf: Buffer, offset: number, value: number) {
  buf.writeUInt16LE(value, offset);
  buf.writeUInt16BE(value, offset + 2);
}

function toISO9660Name(name: string): string {
  return name
    .replace(/[^A-Z0-9._]/g, "_")
    .substring(0, 30);
}
