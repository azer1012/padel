import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import terrainsRouter from "./terrains";
import reservationsRouter from "./reservations";
import playerSessionsRouter from "./player-sessions";
import calendarRouter from "./calendar";
import tokensRouter from "./tokens";
import newsRouter from "./news";
import tournamentsRouter from "./tournaments";
import dashboardRouter from "./dashboard";
import notificationsRouter from "./notifications";
import pricingRouter from "./pricing";
import equipmentRouter from "./equipment";
import seriesRouter from "./series";
import pushRouter from "./push";
import jobsRouter from "./jobs";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(terrainsRouter);
router.use(calendarRouter);
router.use(reservationsRouter);
router.use(playerSessionsRouter);
router.use(tokensRouter);
router.use(newsRouter);
router.use(tournamentsRouter);
router.use(dashboardRouter);
router.use(notificationsRouter);
router.use(pricingRouter);
router.use(equipmentRouter);
router.use(seriesRouter);
router.use(pushRouter);
router.use(jobsRouter);

export default router;
