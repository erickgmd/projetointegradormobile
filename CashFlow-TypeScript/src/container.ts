await import("./migrate.js");
if (process.exitCode) process.exit(1);
await import("./server.js");
