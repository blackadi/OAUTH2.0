import { Router } from "express";
import {
  hskCreateController,
  hskGetController,
  hskDeleteController,
  hskListController,
} from "../controllers/hsk.controller";
import { generalLimiter } from "../middleware/rate-limit";

const router = Router();

router.post("/hsk/create", generalLimiter, hskCreateController.handleCreate);
router.get("/hsk/get/:handle", generalLimiter, hskGetController.handleGet);
router.delete("/hsk/delete/:handle", generalLimiter, hskDeleteController.handleDelete);
router.get("/hsk/list", generalLimiter, hskListController.handleList);

export default router;
