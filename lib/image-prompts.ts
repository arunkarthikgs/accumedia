export const DEFAULT_IMAGE_GENERATION_PROMPT = `Create a professional, non-sensational medical education graphic for {channelLabel}.
Subject/theme: {brief}
Style: clean, modern healthcare editorial illustration, abstract or iconographic.
Never depict a real patient, face, or identifiable person. Do not include patient names, identifiers, contact details, addresses, dates of birth, or embedded text.
Use the organization's accent color {accent} and leave clear negative space for a logo and title overlay.`;

export const DEFAULT_IMAGE_SAFETY_PROMPT = `Screen this clinical image for publication safety. Detect real human faces, patient names, dates of birth, phone numbers, emails, medical record numbers, IDs, insurance numbers, addresses, and other patient-identifying information. Do not flag generic medical topic text, educational title text, hospital branding, disclaimers, or NMC/publication wording unless that text contains a patient identifier. Do not treat generic diagrams or anatomical illustrations as a real face. Return JSON only: {faceDetected:boolean, findings:[{type:string,detail:string,confidence:'high'|'medium'|'low',region:{x:number,y:number,width:number,height:number}}]}. Coordinates must be normalized 0-1; use zeroes when unknown.`;
