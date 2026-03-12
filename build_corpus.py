import pandas as pd
import re
import os
import json

VOLPIANO_ALPHABET = "89abcdefghijklmnopqrstuvw"
POSITION_MAP = {note: i for i, note in enumerate(VOLPIANO_ALPHABET)}

def transform_to_contour(volpiano_melody):
    if type(volpiano_melody) is not str:
        return pd.NA
        
    # Extract all notes and their positions
    notes = []
    for i, char in enumerate(volpiano_melody):
        if char in VOLPIANO_ALPHABET:
            notes.append({'char': char, 'pos': i})
            
    if len(notes) < 2:
        return pd.NA
        
    contour = []
    for i in range(len(notes) - 1):
        n1 = notes[i]
        n2 = notes[i+1]
        
        # Calculate interval
        try:
            p1 = POSITION_MAP[n1['char']]
            p2 = POSITION_MAP[n2['char']]
        except KeyError:
            continue
            
        if p2 > p1:
            c = "u"
        elif p2 < p1:
            c = "d"
        else:
            c = "r"
            
        # Check if there's a syllable break between these two notes
        # A syllable break is one or more '-' characters
        inter_content = volpiano_melody[n1['pos']+1 : n2['pos']]
        if '-' in inter_content:
            contour.append("_")
            
        contour.append(c)
        
    return "".join(contour)

def build_corpus():
    print("Building Corpus Data...")
    
    # 1. Main Corpus
    try:
        main_corpus = pd.read_csv("data/corpus.csv")
    except FileNotFoundError:
        print("data/corpus.csv not found. Reverting to online copy.")
        main_corpus = pd.read_csv("https://raw.githubusercontent.com/timeipert/adiastematic_search/refs/heads/master/corpus.csv")
        
    main_corpus.dropna(subset=["volpiano"], inplace=True)
    main_corpus = main_corpus.copy()
    main_corpus["contour"] = main_corpus["volpiano"].apply(transform_to_contour)
    main_corpus.dropna(subset=["contour"], inplace=True)
    main_corpus["database_source"] = "Main Corpus (Corpus Monodicum)"
    
    # Keep only what we need for the frontend to reduce file size
    cols_to_keep = [
        "uuid", "siglum", "related_chant", "genre", "subgenre", "genre2", 
        "mode", "feast_day", "feast_time", "initial_text", "melodyname_standardized",
        "editor", "volpiano", "contour", "database_source"
    ]
    main_corpus.rename(columns={"source_id": "siglum"}, inplace=True)
    for col in cols_to_keep:
        if col not in main_corpus.columns:
            main_corpus[col] = ""
    main_corpus = main_corpus[cols_to_keep]

    # 2. Schlager Melodies 
    schlager_corpus = pd.DataFrame()
    if os.path.exists("data/schlager_melodies.csv"):
        try:
            schlager_df = pd.read_csv("data/schlager_melodies.csv")
            schlager_df.dropna(subset=["Volpiano"], inplace=True)
            
            def extract_schlager_meta(row):
                id_str = str(row['ID'])
                parts = id_str.split('\n')
                schlager_id = parts[0].strip() if len(parts) > 0 else ''
                cantus_id = ''
                if len(parts) > 1 and 'Cantus ID:' in parts[1]:
                    cantus_id = parts[1].replace('Cantus ID:', '').strip()
                genre = ''
                mode = ''
                if len(parts) > 2 and 'Genre:' in parts[2]:
                    g_m_parts = parts[2].split('|')
                    genre = g_m_parts[0].replace('Genre:', '').strip() if len(g_m_parts) > 0 else ''
                    mode = g_m_parts[1].replace('Mode:', '').strip() if len(g_m_parts) > 1 else ''
                return pd.Series({
                    'uuid': schlager_id, 
                    'siglum': '', # Schlager doesn't usually have a single siglum field easily extractable like CM
                    'related_chant': cantus_id, 
                    'genre': genre, 
                    'mode': mode,
                    'initial_text': ''
                })
                
            meta_df = schlager_df.apply(extract_schlager_meta, axis=1)
            schlager_corpus = pd.concat([schlager_df, meta_df], axis=1)
            schlager_corpus.rename(columns={"Volpiano": "volpiano"}, inplace=True)
            schlager_corpus["contour"] = schlager_corpus["volpiano"].apply(transform_to_contour)
            schlager_corpus.dropna(subset=["contour"], inplace=True)
            schlager_corpus["database_source"] = "Schlager Melodies"
            # Standardize columns
            for col in cols_to_keep:
                if col not in schlager_corpus.columns:
                    schlager_corpus[col] = ""
            schlager_corpus = schlager_corpus[cols_to_keep]
        except Exception as e:
            print(f"Error loading schlager_melodies.csv: {e}")
            
    # Combine
    combined = pd.concat([main_corpus, schlager_corpus], ignore_index=True)
    
    # 3. Personal Transcriptions
    if os.path.exists("transcriptions.csv"):
        try:
            transcriptions = pd.read_csv("transcriptions.csv")
            if "contour" not in transcriptions.columns and "volpiano" in transcriptions.columns:
                 transcriptions["contour"] = transcriptions["volpiano"].apply(transform_to_contour)
            
            for col in cols_to_keep:
                if col not in transcriptions.columns:
                    transcriptions[col] = ""
                    
            transcriptions["database_source"] = "Personal Transcriptions"
            transcriptions = transcriptions[cols_to_keep]
            combined = pd.concat([combined, transcriptions], ignore_index=True)
        except Exception as e:
            print(f"Error loading transcriptions.csv: {e}")

    # Ensure docs dir exists
    os.makedirs("docs", exist_ok=True)
    
    # Export to JSON
    # Convert NaN to empty strings for strict JSON compliance and smaller size
    combined.fillna("", inplace=True)
    
    out_path = "docs/search_data.json"
    combined.to_json(out_path, orient="records", indent=None)
    
    print(f"Successfully exported {len(combined)} melodies to {out_path} ({os.path.getsize(out_path)/1024/1024:.2f} MB)")

if __name__ == "__main__":
    build_corpus()
