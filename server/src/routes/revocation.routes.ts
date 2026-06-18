import { Router } from "express";
import { revocationController } from "../controllers/revocation.controller";

const router = Router();

router.post("/revocation", revocationController.handleRevocation);

export default router;
