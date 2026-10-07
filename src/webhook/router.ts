import express, { Router } from 'express';

import { bridgeWebhookHandler } from './bridge.handler.js';

export const webhookRouter: Router = Router();

webhookRouter.post('/bridge', express.raw({ type: '*/*', limit: '1mb' }), bridgeWebhookHandler);
