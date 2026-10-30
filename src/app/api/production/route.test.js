import { POST, DELETE } from "./route";
import getDatabase from "@/database/connectToMongoDB";
import { ObjectId } from "mongodb";

jest.mock("@/lib/mutation-auth", () => ({ requireAdmin: async () => null, requireStaff: async () => null }));
jest.mock("@/database/connectToMongoDB", () => ({ __esModule:true, default:jest.fn() }));

function database() {
  let state = { entries:[], stock_ledger:[], stock_balance:{ _id:"current" } };
  let failStock = false;
  const session = { endSession:jest.fn(), withTransaction:async action => {
    const snapshot = JSON.parse(JSON.stringify(state));
    try { return await action(); } catch(error) { state=snapshot; throw error; }
  } };
  const db = { client:{startSession:()=>session}, collection(name) {
    if(name === "entries") return {
      find:query=>({sort:()=>({toArray:async()=>state.entries.filter(row=>row.date===query.date)})}),
      findOne:async query=>state.entries.find(row=>String(row._id)===String(query._id)),
      insertOne:async row=>{ const _id=new ObjectId(); state.entries.push({...row,_id});return {acknowledged:true,insertedId:_id}; },
      deleteOne:async query=>{ const i=state.entries.findIndex(row=>String(row._id)===String(query._id));if(i<0)return{deletedCount:0};state.entries.splice(i,1);return{deletedCount:1}; },
    };
    if(name === "stock_ledger") return {insertMany:async rows=>{state.stock_ledger.push(...rows);return{acknowledged:true};}};
    if(name === "stock_balance") return {
      findOne:async()=>state.stock_balance,
      updateOne:async (_query,update)=>{if(failStock)throw Error("Stock unavailable");for(const [key,value]of Object.entries(update.$inc||{}))state.stock_balance[key]=(state.stock_balance[key]||0)+value;Object.assign(state.stock_balance,update.$set||{});return{acknowledged:true};},
    };
    throw Error("Unexpected collection: "+name);
  } };
  return {db,session,state:()=>state,failStock:()=>{failStock=true;}};
}
const request = details=>({json:async()=>({date:"2026-10-31",batch:"B311026",curd_quantity:10,butter_quantity:2,...details})});
const deletion = id=>({url:`http://localhost/api/production?id=${id}`});
let mockDb;
beforeEach(()=>{jest.clearAllMocks();jest.spyOn(console,"log").mockImplementation(()=>{});mockDb=database();getDatabase.mockResolvedValue(mockDb.db);});
afterEach(()=>jest.restoreAllMocks());

test.each([false,undefined])("production with affectStockValue %s never changes stock on create or delete",async affectStockValue=>{
 const response=await POST(request({affectStockValue}));expect(response.status).toBe(201);const {id}=await response.json();
 expect(mockDb.state().stock_ledger).toHaveLength(0);expect(mockDb.state().stock_balance).toEqual({_id:"current"});
 expect((await DELETE(deletion(id))).status).toBe(200);expect(mockDb.state().entries).toHaveLength(0);expect(mockDb.state().stock_ledger).toHaveLength(0);
});
test("production adds each output once and deleting reverses it once",async()=>{
 const created=await POST(request({affectStockValue:true,cream_quantity:3}));expect(created.status).toBe(201);const {id}=await created.json();
 expect(mockDb.state().stock_balance).toMatchObject({curd:10,butter:2,cream:3});expect(mockDb.state().stock_ledger.map(row=>row.quantity)).toEqual([10,2,3]);
 expect(mockDb.state().stock_ledger.every(row=>row.type==="production"&&String(row.referenceId)===id)).toBe(true);
 expect((await DELETE(deletion(id))).status).toBe(200);expect(mockDb.state().stock_balance).toMatchObject({curd:0,butter:0,cream:0});
 expect((await DELETE(deletion(id))).status).toBe(404);expect(mockDb.state().stock_ledger).toHaveLength(6);
});
test("a failed stock update rolls back production insertion and ledger",async()=>{
 mockDb.failStock();expect((await POST(request({affectStockValue:true}))).status).toBe(500);expect(mockDb.state().entries).toHaveLength(0);expect(mockDb.state().stock_ledger).toHaveLength(0);expect(mockDb.session.endSession).toHaveBeenCalled();
});
test("fractional production additions and reversals leave an exact zero balance",async()=>{
 const first=await(await POST(request({affectStockValue:true,curd_quantity:0.1,butter_quantity:0}))).json();
 const second=await(await POST(request({affectStockValue:true,curd_quantity:0.2,butter_quantity:0}))).json();
 expect(mockDb.state().stock_balance.curd).toBe(0.3);
 expect((await DELETE(deletion(first.id))).status).toBe(200);
 expect((await DELETE(deletion(second.id))).status).toBe(200);
 expect(mockDb.state().stock_balance.curd).toBe(0);
});
test("a failed stock reversal rolls back the deletion and ledger",async()=>{
 const {id}=await(await POST(request({affectStockValue:true}))).json();mockDb.failStock();expect((await DELETE(deletion(id))).status).toBe(500);
 expect(mockDb.state().entries).toHaveLength(1);expect(mockDb.state().stock_ledger).toHaveLength(2);expect(mockDb.state().stock_balance).toMatchObject({curd:10,butter:2});
});
test.each(["true","false",1,null])("nonboolean stock flag %s is rejected",async affectStockValue=>{
 expect((await POST(request({affectStockValue}))).status).toBe(400);expect(getDatabase).not.toHaveBeenCalled();
});
test.each(["10abc","Infinity",-1])("invalid stock quantity %s is rejected",async curd_quantity=>{
 expect((await POST(request({curd_quantity}))).status).toBe(400);expect(getDatabase).not.toHaveBeenCalled();
});
test("percentages alone cannot create an empty production record",async()=>{
 expect((await POST(request({curd_quantity:0,butter_quantity:0,fat_percentage:5,snf_percentage:8}))).status).toBe(400);expect(getDatabase).not.toHaveBeenCalled();
});
test("invalid deletion ID fails before reading the database",async()=>{
 expect((await DELETE(deletion("invalid"))).status).toBe(400);expect(getDatabase).not.toHaveBeenCalled();
});
