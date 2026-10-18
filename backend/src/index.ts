import { createApp } from './app.js';
import { config } from './core/config.js';

createApp().listen(config.port, () => {
  console.log(`listening on ${config.port}`);
});
