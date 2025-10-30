#!/usr/bin/env node
import { TonalMCPServer } from './server.js';

const server = new TonalMCPServer();
server.run().catch(console.error);