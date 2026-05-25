import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import terrainsRouter from "./terrains";
import terrainSlotsRouter from "./terrain-slots";
import reservationsRouter from "./reservations";
import playerSessionsRouter from "./player-sessions";
import calendarRouter from "./calendar";
import tokensRouter from "./tokens";
import newsRouter from "./news";
import tournamentsRouter from "./tournaments";
import dashboardRouter from "./dashboard";
import notificationsRouter from "./notifications";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(terrainsRouter);
router.use(terrainSlotsRouter);
router.use(calendarRouter);
router.use(reservationsRouter);
router.use(playerSessionsRouter);
router.use(tokensRouter);
router.use(newsRouter);
router.use(tournamentsRouter);
router.use(dashboardRouter);
router.use(notificationsRouter);

export default router;
