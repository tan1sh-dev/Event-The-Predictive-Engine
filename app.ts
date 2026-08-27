import express from "express";
import engineServer from "./apps/server/src/index.ts";

/** Vercel detects Express from this root entry (before the projector `index.js`). */
void express;

export default engineServer;
