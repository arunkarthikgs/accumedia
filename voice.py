from gtts import gTTS

clinical_dictation_script = """
Patient is a 58-year-old male presenting to the outpatient clinic with complaints of 
epigastric burning pain radiating to the back for the past four days, accompanied by nausea 
and two episodes of non-bloody bilious vomiting. 

Past medical history is notable for essential hypertension diagnosed five years ago, 
managed on Amlodipine 5 milligrams once daily, and type 2 diabetes mellitus on Metformin 
500 milligrams twice daily. Patient reports history of heavy alcohol consumption over 
the weekend prior to symptom onset. No known drug allergies.

On examination: Blood pressure is 142 over 88 millimeters of mercury. Heart rate is 96 beats 
per minute, regular. Respiratory rate is 18 breaths per minute. Temperature is 98.6 degrees 
Fahrenheit. Oxygen saturation is 98 percent on ambient air. Abdominal examination reveals 
marked tenderness on palpation in the epigastric region with voluntary guarding, but no 
rigidity or rebound tenderness. Bowel sounds are sluggish. Cardiovascular and respiratory 
examinations are unremarkable.

Laboratory investigations ordered: Complete blood count, serum amylase, and serum lipase. 
Lipase is significantly elevated at 480 units per liter. Serum amylase is 210 units per liter. 
Liver function tests show mild elevation of AST and ALT, with normal total bilirubin. 
Ultrasound abdomen demonstrates a mildly bulky pancreas with peri-pancreatic fluid collection, 
no gallstones or common bile duct dilation identified.

Impression: Acute mild interstitial pancreatitis, likely alcohol-induced, in a patient with 
underlying hypertension and diabetes mellitus.

Management plan: 
Initiate intravenous fluid hydration with Ringer's Lactate at 150 milliliters per hour. 
Keep patient on nil per oral for the next twelve hours, followed by graded oral rehydration as tolerated. 
Administer Injection Pantoprazole 40 milligrams IV once daily for gastroprotection. 
Administer Injection Tramadol 50 milligrams IV as needed for acute pain control. 
Administer Injection Ondansetron 4 milligrams IV eight-hourly for nausea. 
Continue regular home medications under sliding scale glycemic monitoring. 
Order serial serum lipase and electrolytes in 24 hours. Counsel patient regarding strict alcohol cessation.
"""

# Generate and save audio file
tts = gTTS(text=clinical_dictation_script, lang="en", tld="co.in", slow=False)
tts.save("clinical_case_test.mp3")
print("Audio generated: clinical_case_test.mp3")
