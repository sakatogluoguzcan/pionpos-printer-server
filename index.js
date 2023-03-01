const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const expressApp = require("./server.js")(app.getPath("userData"));

function createWindow() {
  const win = new BrowserWindow({
    width: 340,
    height: 140,
    maximizable: true, // Enable the maximize button

    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
    },
    icon: path.join(__dirname, "./icon.png"),
  });

  win.loadFile("index.html");

  const path_ = app.getPath("userData");
  ipcMain.on("get-port", (event) => {
    event.reply("port", path_);
  });
  win.on("maximize", () => {
    win.setSize(340, 800);
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});
