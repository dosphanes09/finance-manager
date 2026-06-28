import { Router, type IRouter } from "express";
import healthRouter from "./health";
import uploadRouter from "./upload";
import transactionsRouter from "./transactions";
import dashboardRouter from "./dashboard";
import categoriesRouter from "./categories";
import budgetsRouter from "./budgets";
import rulesRouter from "./rules";
import insightsRouter from "./insights";
import demoRouter from "./demo";

const router: IRouter = Router();

router.use(healthRouter);
router.use(uploadRouter);
router.use(transactionsRouter);
router.use(dashboardRouter);
router.use(categoriesRouter);
router.use(budgetsRouter);
router.use(rulesRouter);
router.use(insightsRouter);
router.use(demoRouter);

export default router;
