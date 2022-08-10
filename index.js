#! /usr/bin/env node

import archiver from "archiver";
import axios from "axios";
import { program } from "commander";
import fs from "fs";
import path, { basename } from "path";
import semver from "semver";
import FormData from "form-data";
import { performance } from "perf_hooks";
import prompt from "prompt";
import setCookie from "set-cookie-parser";
const registry = "http://localhost:5173";
// const registry = "https://www.elidavies.com";
const instance = axios.create({ baseURL: registry, withCredentials: true });
let auth_token = "";
program
  .command("pkg <directory>")
  .description("zips up a directory to make it ready for packaging")
  .action((dir) => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(dir, "/manifest.json"), "utf-8")
    );
    if (!semver.valid(manifest.version)) {
      console.log(
        "ERR: version " +
          manifest.version +
          " is not valid semver (https://semver.org/)"
      );
      process.exit(1);
    }
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
  .action((dir) => {
    prompt.get(["username", { name: "password", hidden: true }]).then((res) => {
      instance
        .post(
          registry + "/api/signin",
          { username: res.username, password: res.password },
          {
            withCredentials: true,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Content-Type": "application/json",
            },
          }
        )
        .then((res) => {
          const cookies = setCookie.parse(res.headers["set-cookie"]);
          const token = cookies.find((v) => v.name == "token").value;
          auth_token = token;
          const manifest = JSON.parse(
            fs.readFileSync(path.join(dir, "/manifest.json"), "utf-8")
          );
          if (!semver.valid(manifest.version)) {
            console.log(
              "ERR: version " +
                manifest.version +
                " is not valid semver (https://semver.org/)"
            );
            process.exit(1);
          }
          const exists = fs.existsSync(path.join(dir, "README.md"));
          const readme = exists
            ? fs.readFileSync(path.join(dir, "README.md"), "utf-8")
            : "Edit this readme on the site!";
          if (!exists) console.log("no README.md found, edit on site");
          instance
            .post(
              registry + "/api/mods",
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
                  Cookie: "token=" + auth_token,
                },
              }
            )
            .then((v) => {
              console.log(v.status);
              console.log(
                "Created mod on server (" +
                  registry +
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
            .catch(console.error);
        })
        .catch(console.error);
    });
  });

program
  .command("upload <mod_archive_or_directory>")
  .description("uploads a packaged mod and publishes a new version")
  .action(async (archive) => {
    let zip = archive;
    if (fs.lstatSync(archive).isDirectory()) {
      zip = await pkg(archive);
    }
    prompt.get(["username", { name: "password", hidden: true }]).then((res) => {
      instance
        .post(
          registry + "/api/signin",
          { username: res.username, password: res.password },
          {
            withCredentials: true,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Content-Type": "application/json",
            },
          }
        )
        .then((res) => {
          const cookies = setCookie.parse(res.headers["set-cookie"]);
          const token = cookies.find((v) => v.name == "token").value;
          auth_token = token;
          const formData = new FormData();
          formData.append("mod", fs.createReadStream(zip), basename(zip));
          axios
            .post(registry + "/api/versions", formData, {
              headers: {
                Cookie: "token=" + auth_token,
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
              if (error.response) {
                // The request was made and the server responded with a status code
                // that falls out of the range of 2xx
                console.log(error.response.data);
                console.log(error.response.status);
              } else if (error.request) {
                // The request was made but no response was received
                // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
                // http.ClientRequest in node.js
                console.log(!error.response);
              } else {
                // Something happened in setting up the request that triggered an Error
                console.log("Error", error.message);
              }
            });
        });
    });
  });
async function pkg(folder) {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(folder, "/manifest.json"), "utf-8")
  );
  if (!semver.valid(manifest.version)) {
    console.log(
      "ERR: version " +
        manifest.version +
        " is not valid semver (https://semver.org/)"
    );
    process.exit(1);
  }
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
program.parse();
