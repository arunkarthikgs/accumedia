from gtts import gTTS

ortho_pii_script = """
Orthopaedic outpatient consultation dictation. Encounter date: 14th September 2026.

Patient Identification and Demographic Information:
Full Name: Ananya Sundaram.
Date of Birth: 24th November 1991. Age: 34 years old. Gender: Female.
Government Aadhaar Identity: 6721 9843 2105.
Ayushman Bharat Health Account ABHA ID: 91-4321-8765-1234.
Primary Contact Number: +91 97412 34567.
Email ID: ananya.sundaram91@outlook.com.
Residential Address: Villa 18, Palm Meadows Gated Community, Varthur Road, Whitefield, Bangalore, Karnataka, 560066.
Emergency Contact: Karthik Sundaram, spouse, reachable at +91 98801 23456.
Occupation: Senior UX Designer at Infosys Limited, SEZ Phase 2.
Corporate Health Insurance Policy: Star Health Comprehensive Policy Number SH-BLR-9988214.

Attending Orthopaedic Surgeon:
Dr. Arvind Swaminathan, MS Orthopaedics, NMC Registration Number 67890, Department of Arthroscopy and Joint Reconstruction.

Chief Complaint and History of Present Illness:
Patient presents with severe right knee pain, recurrent giving-way sensation, and joint swelling following an acute twisting injury while playing recreational badminton three days ago. Patient felt an audible pop at the moment of deceleration and was unable to bear weight immediately. Cold compression was applied at home with minimal relief.

Physical Examination:
Vitals: Blood pressure 120 over 76 millimeters of mercury, pulse rate 74 beats per minute regular, temperature 98.4 degrees Fahrenheit.
Right knee examination demonstrates moderate joint effusion with suprapatellar pouch fullness. 
Range of motion is restricted: flexion limited to 90 degrees secondary to pain, extension deficit of 10 degrees due to hamstring spasm and mechanical block.
Special orthopaedic stress tests:
Lachman test is strongly positive with a soft endpoint and marked anterior tibial translation compared to the contralateral uninjured left knee.
Anterior drawer test is positive.
Pivot shift test elicits a distinct clunk.
Medial joint line tenderness is noted on deep palpation. McMurray test produces a painful click along the posterior horn of the medial meniscus.
Valgus and varus stress tests are stable at 0 and 30 degrees of flexion, confirming intact collateral ligaments.
Distal neurovascular status is completely intact: dorsalis pedis and posterior tibial pulses are 2 plus and palpable. Sensation across L4, L5, and S1 dermatomes is preserved.

Diagnostic Imaging Review:
Plain radiographs of the right knee, anteroposterior and lateral weight-bearing views, show no acute bony avulsion, fracture, or joint space narrowing.
High-resolution 3-Tesla MRI of the right knee reveals a complete mid-substance tear of the Anterior Cruciate Ligament with disruption of normal fiber continuity. There is an associated bucket-handle tear of the posterior horn of the medial meniscus with peripheral displacement. Mild bone marrow contusion pattern involving the posterior lateral tibial plateau and lateral femoral condyle. PCL and collaterals are anatomically intact.

Clinical Impression:
Complete rupture of the right Anterior Cruciate Ligament with concurrent bucket-handle tear of the medial meniscus and traumatic joint effusion.

Management Plan:
1. Immediate conservative stabilization: Place patient in a hinged right knee brace locked in extension. Apply cryotherapy for 20 minutes every four hours. Non-weight-bearing mobilization using bilateral axillary crutches.
2. Pharmacological prescription: Tablet Etoricoxib 90 milligrams orally once daily after food for five days for anti-inflammatory pain relief. Tablet Pantoprazole 40 milligrams orally once daily before breakfast.
3. Surgical scheduling: Elective arthroscopic ACL reconstruction using autologous quadrupled hamstring tendon autograft, combined with arthroscopic medial meniscal repair or partial meniscectomy, scheduled for next Tuesday pending pre-operative anaesthetic clearance.
4. Pre-operative investigations ordered: Complete blood count, coagulation profile PT INR, viral markers, fasting blood sugar, and 12-lead ECG.
"""

print("Synthesizing orthopaedic clinical encounter audio with PII tokens...")
tts = gTTS(text=ortho_pii_script, lang="en", tld="co.in", slow=False)
output_filename = "clinical_ortho_pii_test.mp3"
tts.save(output_filename)
print(f"Generated: {output_filename}")
