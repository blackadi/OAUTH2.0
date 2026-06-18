import { app } from "./app";
import logger from "./utils/logger";
import { server } from "./config/app.config";

const PORT = server.port;

app.listen(PORT, () => {
  logger(`Authorization Server running on port ${PORT}`);
});
