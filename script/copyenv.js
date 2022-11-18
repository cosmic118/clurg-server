import fs from "fs";

if (!fs.existsSync(`.env`)) {
  console.log(`Copying .env.example to .env`);
  fs.copyFileSync(`env_default.env`, `.env`);
  console.log(`successfully generated .env file`);
} else {
  console.log(`skipping .env file generation`);
}
