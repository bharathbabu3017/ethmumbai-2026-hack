// Placeholder until calls and stats come from real fills.
export const traders = [
  { name: "Slow Tide", initials: "ST", color: "#C4F250", calls: 84, ret: "+41.2%", win: "68%", dd: "-7.4%", copyRet: "+33.8%", copiers: 412 },
  { name: "Kestrel", initials: "KE", color: "#7AA7FF", calls: 61, ret: "+29.6%", win: "61%", dd: "-11.2%", copyRet: "+22.1%", copiers: 287 },
  { name: "Nine Lanterns", initials: "NL", color: "#FFB86B", calls: 122, ret: "+24.3%", win: "57%", dd: "-9.8%", copyRet: "+19.4%", copiers: 196 },
  { name: "Fathom", initials: "FA", color: "#B9A6FF", calls: 47, ret: "+18.9%", win: "64%", dd: "-5.1%", copyRet: "+16.2%", copiers: 143 },
  { name: "Oat Capital", initials: "OC", color: "#7FE0D2", calls: 95, ret: "+12.7%", win: "53%", dd: "-13.6%", copyRet: "+6.9%", copiers: 98 },
  { name: "Ledgerbird", initials: "LB", color: "#FF9EC4", calls: 33, ret: "-3.4%", win: "46%", dd: "-16.0%", copyRet: "-5.2%", copiers: 41 },
];

export const calls = [
  { who: "Slow Tide", initials: "ST", color: "#C4F250", age: "2m ago", status: "Waiting for entry", statusColor: "#7AA7FF", title: "Long WETH on Base", entry: "$3,420", stop: "$3,280", target: "$3,760", foot: "38 copied so far", open: true },
  { who: "Kestrel", initials: "KE", color: "#7AA7FF", age: "14m ago", status: "Live", statusColor: "#C4F250", title: "Long AERO on Base", entry: "$1.42", stop: "$1.31", target: "$1.74", foot: "Filled at $1.42", open: true },
  { who: "Nine Lanterns", initials: "NL", color: "#FFB86B", age: "1h ago", status: "Cancelled by trader", statusColor: "#FF9470", title: "Long cbBTC on Base", entry: "$96,200", stop: "$93,800", target: "$101,500", foot: "Never filled", open: false },
  { who: "Fathom", initials: "FA", color: "#B9A6FF", age: "3h ago", status: "Hit target +11.4%", statusColor: "#C4F250", title: "Long ARB on Arbitrum", entry: "$0.82", stop: "$0.76", target: "$0.91", foot: "74 copiers closed in profit", open: false },
];
