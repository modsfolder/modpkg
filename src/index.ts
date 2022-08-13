#! /usr/bin/env node

import archiver from "archiver";
import axios, { AxiosInstance } from "axios";
import { program } from "commander";
import fs from "fs";
import path, { basename } from "path";
import FormData from "form-data";
import { performance } from "perf_hooks";
import prompt from "prompt";
import setCookie from "set-cookie-parser";
import os, { homedir, platform } from "os";
import url from "url";
import ProtocolRegistry from "protocol-registry";
const stringIsAValidUrl = (s: string) => {
  try {
    new url.URL(s);
    return true;
  } catch (err) {
    return false;
  }
};

console.log(
  "modpkg is under the MIT license. Contribute on Github at https://github.com/modsfolder/modpkg"
);
program.name("modpkg");

let auth_token = "";
if (fs.existsSync(path.join(path.join(os.homedir(), ".modpkg_token")))) {
  auth_token = fs.readFileSync(
    path.join(path.join(os.homedir(), ".modpkg_token")),
    "utf-8"
  );
}
program
  .command("register")
  .description("adds the modpkg:// protocol to registry")
  .action(() => {
    ProtocolRegistry.register({
      protocol: "modpkg",
      command: `node ${path.join(__dirname, "./index.js")} $_URL_`,
      override: true,
      terminal: true,
      script: false,
    }).then(async () => {
      console.log("Successfully registered");
    });
  });
program
  .command("pkg <directory>")
  .description("zips up a directory to make it ready for packaging")
  .action((dir) => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(dir, "/manifest.json"), "utf-8")
    );
    const archive = archiver("zip", {
      zlib: { level: 9 }, // Sets the compression level.
    });
    archive.on("warning", function (err) {
      if (err.code === "ENOENT") {
        // log warning
      } else {
        // throw error
        throw err;
      }
    });
    archive.directory(dir, false);
    archive.pipe(
      fs.createWriteStream(path.basename(dir) + "-" + manifest.version + ".zip")
    );
    console.log("Packaging...");
    const now = performance.now();
    archive.finalize().then(() => {
      console.log(
        "Packaged v" +
          manifest.version +
          " of " +
          path.basename(dir) +
          " into " +
          path.basename(dir) +
          "-" +
          manifest.version +
          ".zip in " +
          Math.round(performance.now() - now) +
          "ms"
      );
      console.log(
        "Upload using `modpkg upload " +
          path.basename(dir) +
          "-" +
          manifest.version +
          ".zip" +
          "`"
      );
    });
  });
program
  .command("create <directory>")
  .description("creates a listing for a mod from a directory")
  .option(
    "--registry <url>",
    "use a custom registry",
    "https://www.elidavies.com"
  )
  .action(async (dir, options) => {
    if (auth_token !== "") {
      const res = await axios.get(options.registry + "/api/whoami", {
        headers: { Cookie: "token=" + auth_token },
      });
      if (res.data !== null) {
        createMod(dir, options);
        return;
      }
    }

    prompt.get(["username", "password"]).then((res) => {
      const instance = axios.create({
        baseURL: options.registry,
        withCredentials: true,
      });
      instance
        .post(
          "/api/signin",
          { username: res.username, password: res.password },
          {
            withCredentials: true,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Content-Type": "application/json",
              "Cache-Control": "no-cache",
              Pragma: "no-cache",
              Expires: "0",
            },
          }
        )
        .then((res) => {
          const cookies = setCookie.parse(res.headers["set-cookie"]);
          const token = cookies.find((v) => v.name == "token").value;
          fs.writeFileSync(
            path.join(path.join(os.homedir(), ".modpkg_token")),
            token,
            { encoding: "utf-8" }
          );
          auth_token = token;
          createMod(dir, options);
        })
        .catch(console.error);
    });
  });

program
  .command("upload <mod_archive_or_directory>")
  .description("uploads a packaged mod and publishes a new version")
  .option(
    "--registry <url>",
    "use a custom registry",
    "https://www.elidavies.com"
  )
  .action(async (archive, options) => {
    const instance = axios.create({
      baseURL: options.registry,
      withCredentials: true,
    });
    let zip = archive;
    if (fs.lstatSync(archive).isDirectory()) {
      zip = await pkg(archive);
    }
    if (auth_token !== "") {
      if (auth_token !== "") {
        const res = await axios.get(options.registry + "/api/whoami", {
          headers: { Cookie: "token=" + auth_token },
        });
        if (res.data !== null) {
          uploadMod(zip, options);
          return;
        }
      }
    }
    prompt.get(["username", "password"]).then((res) => {
      instance
        .post(
          "/api/signin",
          { username: res.username, password: res.password },
          {
            withCredentials: true,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Content-Type": "application/json",
              "Cache-Control": "no-cache",
              Pragma: "no-cache",
              Expires: "0",
            },
          }
        )
        .then((res) => {
          const cookies = setCookie.parse(res.headers["set-cookie"]);
          const token = cookies.find((v) => v.name == "token").value;
          fs.writeFileSync(
            path.join(path.join(os.homedir(), ".modpkg_token")),
            token,
            { encoding: "utf-8" }
          );
          auth_token = token;
          uploadMod(zip, options);
        });
    });
  });
async function pkg(folder) {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(folder, "/manifest.json"), "utf-8")
  );

  const archive = archiver("zip", {
    zlib: { level: 9 }, // Sets the compression level.
  });
  archive.on("warning", function (err) {
    if (err.code === "ENOENT") {
      // log warning
    } else {
      // throw error
      throw err;
    }
  });
  archive.directory(folder, false);
  archive.pipe(
    fs.createWriteStream(
      path.basename(folder) + "-" + manifest.version + ".zip"
    )
  );
  console.log("Packaging " + path.basename(folder) + "...");
  const now = performance.now();
  await archive.finalize();

  console.log(
    "Packaged v" +
      manifest.version +
      " of " +
      path.basename(folder) +
      " into " +
      path.basename(folder) +
      "-" +
      manifest.version +
      ".zip in " +
      Math.round(performance.now() - now) +
      "ms"
  );
  return path.basename(folder) + "-" + manifest.version + ".zip";
}
function createMod(dir, options) {
  const instance = axios.create({
    baseURL: options.registry,
    withCredentials: true,
  });
  const manifest = JSON.parse(
    fs.readFileSync(path.join(dir, "/manifest.json"), "utf-8")
  );

  const exists = fs.existsSync(path.join(dir, "README.md"));
  const readme = exists
    ? fs.readFileSync(path.join(dir, "README.md"), "utf-8")
    : "Edit this readme on the site!";
  if (!exists) console.log("no README.md found, edit on site");
  instance
    .post(
      "/api/mods",
      {
        name: manifest.name,
        title: manifest.title,
        description: manifest.description,
        owner: manifest.owner,
        game: manifest.game,
        readme,
      },
      {
        withCredentials: true,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
          Expires: "0",
          Cookie: "token=" + auth_token,
        },
      }
    )
    .then((v) => {
      console.log(v.status);
      console.log(
        "Created mod on server (" +
          options.registry +
          "/mods/" +
          manifest.name +
          ")"
      );
      console.log(
        "Upload a version using `modpkg upload " +
          path.basename(dir) +
          "-" +
          manifest.version +
          ".zip" +
          "`"
      );
    })
    .catch((err) => {
      if (err.response.data.type === "error") {
        console.error("ERR: " + err.response.data.message);
      }
    });
}
function uploadMod(zip, options) {
  const instance = axios.create({
    baseURL: options.registry,
    withCredentials: true,
  });

  const formData = new FormData();
  formData.append("mod", fs.createReadStream(zip), basename(zip));
  instance
    .post("/api/versions", formData, {
      headers: {
        Cookie: "token=" + auth_token,
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        Expires: "0",

        ...formData.getHeaders(),
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    })
    .then((res) => {
      if (res.data.type === "success") {
        console.log("Uploaded " + zip + " successfully");
      }
    })
    .catch((error) => {
      console.log(error);
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        console.log(error.response.data);
        console.log(error.response.status);
      } else if (error.request) {
        // The request was made but no response was received
        // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
        // http.ClientRequest in node.js
        console.log(error.response);
      } else {
        // Something happened in setting up the request that triggered an Error
        console.log("Error", error.message);
      }
    });
}
if (stringIsAValidUrl(process.argv[2])) {
  (async () => {
    const regex = /^modpkg:\/\/([a-zA-Z0-9\-]*)\/([A-Za-z0-9_-]*)/gs;

    const url = process.argv[2];
    let m: RegExpExecArray = regex.exec(url);
    const instance = axios.create({
      baseURL: "https://modsfolder.com",
      withCredentials: true,
    });
    const version = (await instance.get("/api/versions/" + m[2]))
      .data as Version;
    const dependencies = version.dependencies.split(",");
    const installs = [installMod(instance, m[1], version)];

    await Promise.all(
      dependencies.map(async (dep) => {
        const m = /^([a-zA-Z][a-zA-Z0-9\-]*)\:([0-9\+\.]*)$/gs.exec(dep);
        const mod = (await instance.get("/api/mods/" + m[1])).data as {
          id: string;
          slug: string;
        };

        const versions = (
          await instance.get("/api/versions", { params: { mod_id: mod.id } })
        ).data as Version[];
        const dep_version = versions.find((v) => {
          return (
            v.version_number === m[2] && v.mod_loader === version.mod_loader
          );
        });

        installs.push(installMod(instance, m[1], dep_version));
      })
    );
    await Promise.all(installs);

    console.log("Installed mod and dependencies! You can close this window.");
  })();
} else program.parse();
async function installMod(
  instance: AxiosInstance,
  mod_slug: string,
  version: Version
) {
  if (
    fs.existsSync(
      path.join(
        getModsDir(),
        mod_slug +
          "-" +
          version.version_number +
          "-" +
          version.mod_loader +
          ".jar"
      )
    )
  ) {
    console.log(
      "already installed mod",
      mod_slug + ":" + version.version_number
    );
    return;
  }
  console.log("installing", mod_slug + ":" + version.version_number);
  const res = await instance.get(version.download_url, {
    responseType: "stream",
  });

  res.data.pipe(
    fs.createWriteStream(
      path.join(
        getModsDir(),
        mod_slug +
          "-" +
          version.version_number +
          "-" +
          version.mod_loader +
          ".jar"
      )
    )
  );
}
function getModsDir() {
  if (platform() === "win32") {
    return homedir() + "/AppData/Roaming/.minecraft/mods/";
  } else if (platform() == "darwin") {
    return homedir() + "/Library/Application Support/minecraft/mods";
  } else if (platform() == "linux") {
    return homedir() + "/.minecraft/mods";
  }
}
interface Version {
  id: string;
  version_number: string;
  filesize: number;
  download_url: string;
  mod_id: string;
  game_version: string;
  mod_loader: string;
  dependencies: string;
}
