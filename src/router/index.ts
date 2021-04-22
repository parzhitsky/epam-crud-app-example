import { Router } from "express";
import usersRouter from "./users/router";

/** @public */
const router = Router();

router.use("/users", usersRouter);

export default router;
