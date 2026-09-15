from gtts import gTTS

natural_cardio_script = """
Uh, okay, audio note for the ER handoff and cardiology consult. Date is, uh, September 14, 2026. 

This is Dr. Meenakshi Sundaram, registration 39482, seeing Mr. Venkatasubramanian Ramakrishnan. Patient is a 63-year-old gentleman, born March 12, 1963. He's got an Aadhaar number on file, let me see, yeah, 7834 5612 9043, and ABHA ID ending in 8765. Phone is 98401 56789. His wife, Revathi, is outside in the waiting area, her number is 98409 87654. They stay in Malleshwaram, Flat 3B, Sri Krishna Enclave. He works at BEL, Jalahalli, and insurance is HDFC ERGO, card ending in 4190.

Anyway, so, he came in clutching his chest. Started around 3:00 AM, about six hours back, while he was asleep. Describes it as this heavy, tight band across the retrosternal area, radiating straight up into his left jaw and down the medial side of the left arm. Diaphoretic, quite anxious. Took a sublingual sorbitrate at home, got minimal relief, then had two more severe bouts this morning before his wife brought him into casualty.

Quick background on him—he's a known CAD patient. Stented about four years back, drug-eluting stent to the mid LAD. Also hypertensive on Telma 40, diabetic on Metformin and Glimepiride, and he takes Atorva 40 daily, though he admits he skips his evening pills once or twice a week. He used to smoke, pack a day for maybe twenty years, but claims he stopped three years back. No known drug allergies, penicillin or anything like that.

On exam right now: he's sitting up, visibly uncomfortable. Pressure is elevated at 156 over 94 in the right arm. Tachycardic, rate 98, regular rhythm. Sats are 95 percent on room air, respiratory rate around 20. Heart sounds—S1, S2 heard, definitely hearing a soft S4 gallop at the apex. No murmurs, no rubs, JVP isn't elevated. Chest is remarkably clear bilaterally, no creps, no wheeze. Peripheral pulses are intact, no ankle swelling.

We pulled an ECG immediately: sinus rhythm, but there's distinct horizontal ST depression, about 1.5 millimeters across V4 to V6, and T-wave inversion in 1 and aVL. No pathological Q waves, no ST elevation, so this is not a STEMI, but definitely ischemic. Point-of-care high-sensitivity Troponin T just came back from the lab, hot at 145 nanograms per liter. Random sugar 184, potassium 4.3, creatinine is 1.0. Bedside echo shows anterior and anterolateral wall hypokinesia, ejection fraction looks to be around 45 to 48 percent, mild diastolic dysfunction.

So impression: this is an acute coronary syndrome, specifically high-risk NSTEMI, TIMI score looks like a 5. Post-PCI status with recurrent acute ischemia.

Here is the plan:
Shift him immediately to CCU for continuous telemetry. 
He needs dual antiplatelets right away—chewable Aspirin 325 milligrams stat, and load him with Ticagrelor 180 milligrams orally, then continue 90 milligrams BID. 
Start therapeutic low-molecular-weight heparin, Enoxaparin 1 milligram per kilo sub-Q twice daily, first dose now. 
For pain and ischemia: sublingual nitro 0.5 as needed, and start Metoprolol Succinate 25 milligrams daily to bring that heart rate down closer to 60. 
Switch his statin up, give him Rosuvastatin 40 milligrams tonight. 
And let's line him up for the cath lab—early invasive coronary angiography within 24 hours, check the LAD stent patency and look for any new culprit lesions. 
Hold metformin in view of contrast tomorrow, monitor creatinine. That should be all for now.
"""

print("Synthesizing natural, conversational clinical dictation...")
tts = gTTS(text=natural_cardio_script, lang="en", tld="co.in", slow=False)
output_filename = "clinical_natural_cardio_pii.mp3"
tts.save(output_filename)
print(f"Generated: {output_filename}")
