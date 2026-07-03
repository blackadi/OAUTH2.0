import { Router } from "express";
import { jarController } from "../controllers/jar.controller";
import { generalLimiter } from "../middleware/rate-limit";

const router = Router();

router.post("/jar/process", generalLimiter, jarController.process);

export default router;
