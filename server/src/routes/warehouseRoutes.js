import { Router } from "express";
import { createWarehouse, deleteWarehouse, listWarehouses, updateWarehouse } from "../controllers/warehouseController.js";
import { authorize, permit } from "../middleware/authenticate.js";
const router = Router();
router.get("/", listWarehouses);
router.post("/", permit("warehouse.manage", "administrator", "manager"), createWarehouse);
router.put("/:id", permit("warehouse.manage", "administrator", "manager"), updateWarehouse);
router.delete("/:id", permit("warehouse.manage", "administrator", "manager"), deleteWarehouse);
export default router;
