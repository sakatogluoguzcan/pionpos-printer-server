const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const { ipcMain } = require("electron");
const nodeHtmlToImage = require("node-html-to-image");

let screenshotPath = null;
let processedIdList = [];

app.get("/", (req, res) => {
  res.send("welcome to printer app server!");
});

const port = 5002;
const cors = require("cors");
const corsOptions = {
  origin: "*",
};

const ThermalPrinter = require("node-thermal-printer").printer;
const PrinterTypes = require("node-thermal-printer").types;

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
  console.log({ id: req.body.id, processedIdList });
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

app.post("/test", async (req, res) => {
  try {
    const html = req.body.msg;

    const imageSaveOperation = await saveImage(html);

    if (!imageSaveOperation) {
      return res.send({ ERROR: true });
    }

    const result = await print(req.body);
    res.send(result);
  } catch (error) {
    throw new Error("Error occured while printing", error);
  }
});

app.post("/health-check", async (req, res) => {
  const printer = createPrinter(req.body);
  const isConnected = await printer.isPrinterConnected(); // Check if printer is connected, return bool of status
  res.send({
    ...req.body,
    isConnected,
  });
});

app.listen(port, () => {
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
