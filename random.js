import crypto from "crypto";
import { writeFileSync } from "fs";
let buf = Buffer.alloc(1e8).fill(0);
console.log("Buffer: ", buf);
crypto.randomFill(buf, (err, buf) => {
  writeFileSync("example-mod/random.bin", buf);
});
