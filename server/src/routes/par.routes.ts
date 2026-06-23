import { Router } from "express";
import { parController } from "../controllers/par.controller";

const router = Router();

router.post("/par", parController.handle);

export default router;
