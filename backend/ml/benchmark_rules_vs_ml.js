import "dotenv/config";
import mongoose from "mongoose";
import TrainingRecord from "../models/TrainingRecord.js";
import { decideActionByRules } from "../services/recoveryEngine.js";

function sigmoid(x) { return 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, x)))); }
function vector(row) {
  const v = [Number(row.amount)/1000000, Number(row.retryCount), Number(row.timeSinceFailureMinutes)/1000, Number(row.customerHistory)/10, Number(row.previousFailures)/5];
  for (const x of ["card","upi","netbanking","wallet"]) v.push(row.paymentMethod === x ? 1 : 0);
  for (const x of ["bank_timeout","network_error","checkout_abandoned","insufficient_funds","card_declined","otp_failed","unknown"]) v.push(row.failureReason === x ? 1 : 0);
  return v;
}
function train(rows) {
  const X = rows.map(vector), y = rows.map(r => r.recovered ? 1 : 0), w = new Array(X[0].length).fill(0); let b = 0;
  for (let e=0;e<700;e++) {
    const g = new Array(w.length).fill(0); let gb=0;
    for (let i=0;i<X.length;i++) { const p=sigmoid(w.reduce((a,x,j)=>a+x*X[i][j],b)); const err=p-y[i]; for(let j=0;j<w.length;j++) g[j]+=err*X[i][j]; gb+=err; }
    for(let j=0;j<w.length;j++) w[j]-=.08*g[j]/X.length; b-=.08*gb/X.length;
  }
  return {w,b};
}
function predict(m,r){const x=vector(r);return sigmoid(m.w.reduce((a,v,i)=>a+v*x[i],m.b));}
function metrics(labels,preds){let c=0,tp=0,fp=0,fn=0;for(let i=0;i<labels.length;i++){if(labels[i]===preds[i])c++;if(preds[i]&&labels[i])tp++;if(preds[i]&&!labels[i])fp++;if(!preds[i]&&labels[i])fn++;}return {accuracy:+(c/labels.length).toFixed(4),precision:+(tp/Math.max(1,tp+fp)).toFixed(4),recall:+(tp/Math.max(1,tp+fn)).toFixed(4)};}

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!uri) throw new Error("MONGODB_URI/MONGO_URI is required");
await mongoose.connect(uri);
const rows = await TrainingRecord.find({dataSource:"synthetic"}).select("amount paymentMethod failureReason retryCount timeSinceFailureMinutes customerHistory previousFailures recovered -_id").lean();
if (rows.length < 200) throw new Error(`Need at least 200 synthetic records; found ${rows.length}`);
const ordered = [...rows].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
const evalRows = ordered.slice(0,200), trainRows = ordered.slice(200);
const model = train(trainRows), labels = evalRows.map(r=>Boolean(r.recovered));
const rulePred = evalRows.map(r=>decideActionByRules(r).action !== "stop");
const mlPred = evalRows.map(r=>predict(model,r) >= .5);
console.log(JSON.stringify({benchmark:"rules-vs-ml",dataSource:"synthetic",evaluationRecords:evalRows.length,trainingRecords:trainRows.length,rules:metrics(labels,rulePred),ml:metrics(labels,mlPred),note:"Synthetic benchmark only. Labels come from the project's synthetic data generator and are not real merchant outcomes."},null,2));
await mongoose.disconnect();
