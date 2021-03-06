import type { RequestHandler } from "express";
import { getConnection } from "../../db/connect";
import type HealthService from "../../services/health.service";

/** @private */
interface Deps {
	healthService: HealthService;
}

export default function healthCheck({ healthService }: Deps): RequestHandler[] {
	return [
		// avoid making this controller asynchronous, – it should respond rather quickly
		(req, res) => {
			const status = healthService.getStatus();

			res.json({
				message: status.message,
				healthy: status.healthy,
				checks: {
					total: status.checksTotal,
					passed: status.checksPassed,
					ratio: status.healthFactor,
				},
				version: process.env.HEROKU_SLUG_COMMIT,
				db: {
					connection: getConnection(),
				},
			});
		},
	];
}
