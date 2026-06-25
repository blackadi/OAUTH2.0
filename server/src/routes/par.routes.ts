import { Router } from "express";
import { parController } from "../controllers/par.controller";
import { generalLimiter } from "../middleware/rate-limit";

const router = Router();

router.post("/par", generalLimiter, parController.handle);

export default router;
