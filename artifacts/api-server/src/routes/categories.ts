import { Router, type IRouter } from "express";
import { CATEGORIES } from "../lib/categorizer";
import { ListCategoriesResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/categories", async (_req, res): Promise<void> => {
  res.json(ListCategoriesResponse.parse(CATEGORIES));
});

export default router;
