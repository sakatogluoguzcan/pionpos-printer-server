const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const { ipcMain } = require("electron");
const fs = require("fs");
const axios = require("axios");
const nodeHtmlToImage = require("node-html-to-image");

let screenshotPath = null;
let availablePrinters = [];
let processedIdList = [];

app.get("/", (req, res) => {
  res.send("welcome to printer app server!");
});

const Server = require("http").Server;
const server = new Server(app);
const port = 5002;
const cors = require("cors");
const corsOptions = {
  origin: "*",
};

const ThermalPrinter = require("node-thermal-printer").printer;
const PrinterTypes = require("node-thermal-printer").types;

let electronAppIpAddress = null;

axios
  .get("http://ipinfo.io/json")
  .then((response) => {
    electronAppIpAddress = response.data.ip;
  })
  .catch((error) => {
    console.error(error);
  });

function createPrinter(config) {
  let printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: config.TCP_ADDRESS,
    width: config.width ?? 40,
    characterSet: "PC857_TURKISH",
  });
  printer.DETAILS = config;
  return printer;
}

async function print(data) {
  try {
    const printer = createPrinter(data.SELECTED_PRINTER);
    await printer.printImage(screenshotPath);
    printer.cut();
    await printer.execute();
    await printer.beep();
    return { SUCCESS: true, id: data.id, data };
  } catch (error) {
    // remove from processed list
    processedIdList = processedIdList.filter((item) => item !== data.id);
    return { ERROR: true, data, id: data.id };
  }
}

app.use(cors(corsOptions));
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));

let printActionLogs = [];

app.post("/print", async (req, res) => {
  if (processedIdList.includes(req.body.id)) {
    return;
  } else {
    processedIdList.push(req.body.id);
    processedIdList = processedIdList.slice(-10);
  }

  if (
    !availablePrinters.some(
      (item) => item.TCP_ADDRESS === req.body.SELECTED_PRINTER.TCP_ADDRESS
    )
  ) {
    processedIdList = processedIdList.filter((item) => item !== req.body.id);

    return res.send({
      PRINTER_NOT_CONNECTED: true,
      data: req.body,
      id: req.body.id,
      ERROR: true,
    });
  }

  if (req.body.ipAddress !== electronAppIpAddress) return;

  const imageSaveOperation = await saveImage(req.body.msg);

  if (!imageSaveOperation) {
    processedIdList = processedIdList.filter((item) => item !== req.body.id);
    return res.send({
      ERROR: true,
      IMAGE_PROCESS_FAILED: true,
      data: req.body,
      id: req.body.id,
    });
  } else {
    const printAction = await print(req.body);
    res.send(printAction);
    printActionLogs.push(printAction);
    printActionLogs = printActionLogs.slice(-10);
  }
});

ipcMain.on("get-printer-logs", (event) => {
  event.reply("printer-logs", printActionLogs);
});

function healthCheckHtml(printer) {
  return ` 
  <!DOCTYPE html>
  <html lang="tr">
  <head>
    <meta charset="UTF-8" />
    <style>
      body {
        width: 560px;
        font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        padding-left: 1rem;
        padding-right: 1rem;
      }
    </style>
  </head>
  <body>
    <h3 style="text-align: center; font-size: 2rem">Yazıcı Test</h3>
    <h3 style="text-align: center; font-size: 2rem">${printer.name}</h3>
    <h3 style="text-align: center; font-size: 1.4rem">${printer.TCP_ADDRESS}</h3>
  </body>
  </html>
  `;
}

app.post("/printer-healthcheck", async (req, res) => {
  const printerData = req.body.SELECTED_PRINTER;
  const html = healthCheckHtml(printerData);

  const imageSaveOperation = await saveImage(html);
  if (!imageSaveOperation) {
    return res.send({ ERROR: true });
  } else {
    const printAction = await print(req.body);
    res.send(printAction);
  }
});

app.post("/printer-list", async (req, res) => {
  const printerList = req.body;
  printerList.forEach(async (item) => {
    let printer = createPrinter(item);
    let isConnected = await printer.isPrinterConnected(); // Check if printer is connected, return bool of status

    if (isConnected) {
      availablePrinters.push(item);
    }
  });
});

server.listen(port, () => {
  console.log("Server running at: ", `localhost:${port}`);
});

async function saveImage(html) {
  try {
    await nodeHtmlToImage({
      output: screenshotPath,
      html: html,
    });

    return true;
  } catch (error) {
    console.error("Failed to take screenshot", error);
    return false;
  }
}

module.exports = function (path) {
  screenshotPath = path + "/screenshot.png";
  return app;
};
