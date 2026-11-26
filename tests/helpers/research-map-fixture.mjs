// Fictional, temporary research handoff. No saved places or real account.
export const researchPins = [
  {lat:35.001,lng:139.001,label:'Fictional reading room',tags:['Practical · Indoor','Potential · Cocoon']},
  {lat:35.002,lng:139.002,label:'Fictional cafe',tags:['Practical · Indoor','Potential · Hideout']},
  {lat:35.003,lng:139.003,label:'Fictional park',tags:['Practical · Free']},
  {lat:35.004,lng:139.004,label:'Fictional station',tags:['Practical · Indoor']},
  {lat:35.005,lng:139.005,label:'Fictional rest spot',tags:['Potential · Igloo']},
  {lat:35.006,lng:139.006,label:'Fictional tag contrast',tags:['Practical · Cocoon']}
];
export const researchTagOptions=[...new Set(researchPins.flatMap(pin=>pin.tags))].sort();
