import type { Request, RequestHandler } from "express";
import morgan from "morgan";
import logger, { Level } from "../log/logger";

/** @private */
interface HttpLoggerParams {
	level?: Level;
}

morgan.token("id", (req: Request) => req.id);
morgan.format("main", ":method :url :id - :status :response-time ms");

/** @public */
const httpLogger = ({
	level = "info",
}: HttpLoggerParams = {}): RequestHandler => morgan("main", {
	stream: {
		write(log) {
			logger.log(level, log.replace(/\n$/, ""));
		},
	},
});

export default httpLogger;