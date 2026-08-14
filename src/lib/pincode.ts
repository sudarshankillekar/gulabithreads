type PincodeLocation = {
  city: string;
  state: string;
};

export type PincodeLookup = {
  pincode: string;
  city?: string;
  state?: string;
  exact: boolean;
  message: string;
};

const exactPincodeLocations: Record<string, PincodeLocation> = {
  "110001": { city: "New Delhi", state: "Delhi" },
  "122001": { city: "Gurugram", state: "Haryana" },
  "141001": { city: "Ludhiana", state: "Punjab" },
  "160001": { city: "Chandigarh", state: "Chandigarh" },
  "201301": { city: "Noida", state: "Uttar Pradesh" },
  "226001": { city: "Lucknow", state: "Uttar Pradesh" },
  "248001": { city: "Dehradun", state: "Uttarakhand" },
  "302001": { city: "Jaipur", state: "Rajasthan" },
  "380001": { city: "Ahmedabad", state: "Gujarat" },
  "400001": { city: "Mumbai", state: "Maharashtra" },
  "400050": { city: "Mumbai", state: "Maharashtra" },
  "400051": { city: "Mumbai", state: "Maharashtra" },
  "400053": { city: "Mumbai", state: "Maharashtra" },
  "400070": { city: "Mumbai", state: "Maharashtra" },
  "403001": { city: "Panaji", state: "Goa" },
  "411001": { city: "Pune", state: "Maharashtra" },
  "452001": { city: "Indore", state: "Madhya Pradesh" },
  "462001": { city: "Bhopal", state: "Madhya Pradesh" },
  "500001": { city: "Hyderabad", state: "Telangana" },
  "500081": { city: "Hyderabad", state: "Telangana" },
  "520001": { city: "Vijayawada", state: "Andhra Pradesh" },
  "530001": { city: "Visakhapatnam", state: "Andhra Pradesh" },
  "560001": { city: "Bengaluru", state: "Karnataka" },
  "560002": { city: "Bengaluru", state: "Karnataka" },
  "560034": { city: "Bengaluru", state: "Karnataka" },
  "560037": { city: "Bengaluru", state: "Karnataka" },
  "560066": { city: "Bengaluru", state: "Karnataka" },
  "560068": { city: "Bengaluru", state: "Karnataka" },
  "560076": { city: "Bengaluru", state: "Karnataka" },
  "600001": { city: "Chennai", state: "Tamil Nadu" },
  "600020": { city: "Chennai", state: "Tamil Nadu" },
  "625001": { city: "Madurai", state: "Tamil Nadu" },
  "641001": { city: "Coimbatore", state: "Tamil Nadu" },
  "673001": { city: "Kozhikode", state: "Kerala" },
  "682001": { city: "Kochi", state: "Kerala" },
  "700001": { city: "Kolkata", state: "West Bengal" },
  "737101": { city: "Gangtok", state: "Sikkim" },
  "751001": { city: "Bhubaneswar", state: "Odisha" },
  "781001": { city: "Guwahati", state: "Assam" },
  "791111": { city: "Itanagar", state: "Arunachal Pradesh" },
  "793001": { city: "Shillong", state: "Meghalaya" },
  "795001": { city: "Imphal", state: "Manipur" },
  "796001": { city: "Aizawl", state: "Mizoram" },
  "797001": { city: "Kohima", state: "Nagaland" },
  "799001": { city: "Agartala", state: "Tripura" },
  "800001": { city: "Patna", state: "Bihar" },
  "834001": { city: "Ranchi", state: "Jharkhand" },
};

const statePrefixes: Record<string, string> = {
  "11": "Delhi",
  "12": "Haryana",
  "13": "Haryana",
  "14": "Punjab",
  "15": "Punjab",
  "16": "Punjab",
  "17": "Himachal Pradesh",
  "18": "Jammu and Kashmir",
  "19": "Jammu and Kashmir",
  "20": "Uttar Pradesh",
  "21": "Uttar Pradesh",
  "22": "Uttar Pradesh",
  "23": "Uttar Pradesh",
  "24": "Uttar Pradesh",
  "25": "Uttar Pradesh",
  "26": "Uttar Pradesh",
  "27": "Uttar Pradesh",
  "28": "Uttar Pradesh",
  "30": "Rajasthan",
  "31": "Rajasthan",
  "32": "Rajasthan",
  "33": "Rajasthan",
  "34": "Rajasthan",
  "36": "Gujarat",
  "37": "Gujarat",
  "38": "Gujarat",
  "39": "Gujarat",
  "40": "Maharashtra",
  "41": "Maharashtra",
  "42": "Maharashtra",
  "43": "Maharashtra",
  "44": "Maharashtra",
  "45": "Madhya Pradesh",
  "46": "Madhya Pradesh",
  "47": "Madhya Pradesh",
  "48": "Madhya Pradesh",
  "49": "Chhattisgarh",
  "50": "Telangana",
  "51": "Andhra Pradesh",
  "52": "Andhra Pradesh",
  "53": "Andhra Pradesh",
  "56": "Karnataka",
  "57": "Karnataka",
  "58": "Karnataka",
  "59": "Karnataka",
  "60": "Tamil Nadu",
  "61": "Tamil Nadu",
  "62": "Tamil Nadu",
  "63": "Tamil Nadu",
  "64": "Tamil Nadu",
  "67": "Kerala",
  "68": "Kerala",
  "69": "Kerala",
  "70": "West Bengal",
  "71": "West Bengal",
  "72": "West Bengal",
  "73": "West Bengal",
  "74": "West Bengal",
  "75": "Odisha",
  "76": "Odisha",
  "77": "Odisha",
  "78": "Assam",
  "80": "Bihar",
  "81": "Bihar",
  "82": "Jharkhand",
  "83": "Jharkhand",
  "84": "Bihar",
  "85": "Bihar",
};

const statePrefixExceptions: Record<string, string> = {
  "396": "Dadra and Nagar Haveli and Daman and Diu",
  "403": "Goa",
  "605": "Puducherry",
  "737": "Sikkim",
  "744": "Andaman and Nicobar Islands",
  "790": "Arunachal Pradesh",
  "791": "Arunachal Pradesh",
  "792": "Arunachal Pradesh",
  "793": "Meghalaya",
  "794": "Meghalaya",
  "795": "Manipur",
  "796": "Mizoram",
  "797": "Nagaland",
  "798": "Nagaland",
  "799": "Tripura",
};

export function normalizePincode(value: string) {
  return value.replace(/\D/g, "").slice(0, 6);
}

export function lookupIndianPincode(value: string): PincodeLookup | null {
  const pincode = normalizePincode(value);
  if (pincode.length !== 6) return null;

  const exact = exactPincodeLocations[pincode];
  if (exact) {
    return {
      pincode,
      city: exact.city,
      state: exact.state,
      exact: true,
      message: `Detected ${exact.city}, ${exact.state}.`,
    };
  }

  const state = statePrefixExceptions[pincode.slice(0, 3)] || statePrefixes[pincode.slice(0, 2)];
  if (state) {
    return {
      pincode,
      state,
      exact: false,
      message: `Detected ${state}. Please confirm the city.`,
    };
  }

  return {
    pincode,
    exact: false,
    message: "We could not auto-detect this pincode. Please enter city and state manually.",
  };
}
