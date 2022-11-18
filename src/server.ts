/* eslint-disable @typescript-eslint/ban-ts-comment */
import express from "express";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import bodyParser from "body-parser";
import multer from "multer";
// @ts-ignore
import JSONrequire from "dead-easy-json";
import cookieParser from "cookie-parser";
// @ts-ignore
import nocache from "nocache";

const upload = multer();

const cwd = process.cwd();
const file = JSONrequire(path.join(cwd, `database.json`)).file;

dotenv.config();

function printConfiguration(
  config: Record<string, unknown>,
  props: string[] = []
) {
  console.log(`configuration`);
  for (const prop of props) {
    if (config[prop] === undefined) {
      console.warn(`  ${prop} is not defined`);
    }
  }
  for (const [k, v] of Object.entries(config)) {
    if (!props.includes(k)) continue;
    console.log(`  ${k}`, v);
  }
}

printConfiguration(process.env, [`PORT`, `SECRET`]);

const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());

// view engine setup
app.set(`views`, path.join(cwd, `pages`));
app.set(`view engine`, `ejs`);

const apiRouter = express.Router();

apiRouter.get(`/status`, (req, res) => {
  res.json({ status: `OK` });
});

let lastseen = 0;

apiRouter.get(`/get-pptx`, (req, res) => {
  if (req.query.secret === process.env.SECRET) {
    if (fs.existsSync(path.join(cwd, `powerpoint.pptx`))) {
      console.log(`a runner has picked up the file`);
      res.sendFile(path.join(cwd, `powerpoint.pptx`));
    } else {
      lastseen = Date.now();
      res.status(404).json({
        message: `pptx file does not exist`,
      });
    }
    return;
  }
  res.status(403).json({
    message: `invalid secret`,
  });
  return;
});

function genetag() {
  return crypto.createHash(`sha256`).update(`${Math.random()}`).digest(`hex`);
}

let imgetag = genetag();

apiRouter.post(`/upload-image`, upload.single(`image`), (req, res) => {
  if (req.query.secret === process.env.SECRET) {
    const buffer = req?.file?.buffer;
    if (!buffer) {
      res.status(401).json({ message: `no buffer on field` });
      return;
    }
    console.log(`removing powerpoint file and writing image`);
    try {
      fs.unlinkSync(path.join(cwd, `powerpoint.pptx`));
    } catch (e: any) {
      if (e?.code !== `ENOENT`) {
        console.error(e);
      }
    }
    fs.writeFileSync(path.join(cwd, `image.jpg`), buffer);
    imgetag = genetag();
    res.status(200).json({ message: `success` });
    return;
  }

  res.status(403).json({
    message: `invalid secret`,
  });
  return;
});

const nc = nocache();

apiRouter.get(
  `/current-pptx.jpg`,
  // This might not be needed as Etags are good enough
  // nc,
  (req, res) => {
    res.set(`etag`, imgetag);
    res.sendFile(`image.jpg`, { root: cwd });
  }
);

function findUser(username: string): string | null {
  for (const [k, v] of Object.entries(file)) {
    if ((v as any)?.username === username) {
      return k;
    }
  }
  return null;
}

function validateToken(tokcomp: string): boolean {
  const [uuid, token] = tokcomp.split(`+`);
  return file[uuid]?.token === token;
}

app.post(`/login`, (req, res) => {
  if (req.cookies && req.cookies.token) {
    // validate
    if (validateToken(req.cookies.token)) {
      console.log(`already logged in`);
      res.redirect(`/admin`);
      return;
    }

    console.log(`invalid token ${req.cookies.token}`);
    res.cookie(`token`, ``, { expires: new Date(0), httpOnly: true });
  }
  let { username, password } = req.body;
  console.log(`username and password ${username} ${password}`);
  if (!username || !password) {
    res.redirect(`/login?error=no-password`);
    return;
  }
  username = username as string;
  password = password as string;
  const user = findUser(username);
  if (user === null) {
    res.redirect(`/login?error=no-password`);

    return;
  }

  if (file[user].password !== password) {
    res.redirect(`/login?error=invalid-password`);
    return;
  }

  const token = `${Math.random()}`.slice(2);

  file[user].token = token;
  res.cookie(`token`, `${user}+${token}`);
  res.redirect(`/admin`);
  console.log(`successful login`);
  return;
});

// @ts-ignore
const tokenCheck = (req, res, next) => {
  console.log(`admin route`);
  if (req.cookies && req.cookies.token) {
    if (validateToken(req.cookies.token)) {
      next();
      return;
    } else {
      console.log(`failed to login`);
    }
  }
  res.redirect(`/login`);
};

app.get(`/admin`, tokenCheck, (req, res) => {
  res.render(`admin`, {
    lastseen: new Date(lastseen).toLocaleString(`en`, {
      timeZone: `America/Chicago`,
    }),
  });
});

app.post(`/admin`, tokenCheck, upload.single(`pptx`), (req, res) => {
  // This is the pptx upload
  // This whole system is not reliable but it works
  // Hopefully the final iteration of this software will be much more organized
  const file = (req as any).file;
  console.log(`posted`, file);
  if (file) {
    fs.writeFileSync(path.join(cwd, `powerpoint.pptx`), file.buffer);
    res.redirect(`/success`);
    return;
  }
  res.redirect(`/error`);
});

app.use(`/api`, apiRouter);

app.get(`*`, (req, res) => {
  // lol
  try {
    const n = new URL(req.url, `http://${req.headers.host}`).pathname.slice(1);
    console.log(n);
    res.render(n ?? `index` + `.ejs`);
  } catch (e) {
    res.end(`404`);
  }
});

app.use(express.static(path.join(cwd, `pages`)));

app.listen(process.env.PORT);

export {};
