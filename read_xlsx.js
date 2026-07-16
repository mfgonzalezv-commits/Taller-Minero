const xlsx = require("xlsx")
const fs = require("fs")

const buf = fs.readFileSync("C:\\Users\\Hp\\Downloads\\BD activos Araya.xlsx")
const wb = xlsx.read(buf, { type: "buffer" })
const ws = wb.Sheets[wb.SheetNames[0]]
const rows = xlsx.utils.sheet_to_json(ws, { defval: "" })

const data = rows.slice(1).map(r => ({
  codigo: String(r["PARQUE ACTIVOS"] || "").trim(),
  modelo: String(r["__EMPTY_2"] || "").trim(),
  marca: String(r["__EMPTY_3"] || "").trim(),
  patente: String(r["__EMPTY_4"] || "").trim(),
})).filter(r => r.codigo && r.codigo !== "CÓDIGO INTERNO EQUIPO")

console.log("Total:", data.length)
data.forEach(r => console.log(JSON.stringify(r)))
