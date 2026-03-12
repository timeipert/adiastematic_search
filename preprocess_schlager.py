import pandas as pd
import re

# Read as raw text first to see the anomalies
with open('data/schlager_melodies.csv', 'r') as f:
    lines = f.readlines()

print("First 10 lines:")
for l in lines[:10]:
    print(repr(l))

data = []
current_id = None
current_cantus = None
current_genre = None
current_mode = None
current_volpiano = None

# A very basic parser based on the structure we saw
# 1: ID,Volpiano
# 2: "mSCH001
# 3: Cantus ID:
# 4: Genre: Al | Mode:",1--9a--cdc--defe--ddefgfdecdddefgfdecdd---------------

# We can probably parse using pandas but let's see what happens with read_csv directly
try:
    df = pd.read_csv('data/schlager_melodies.csv')
    print("\nParsed columns:", df.columns.tolist())
    print(df.head(2))
    
    # Let's extract metadata from the 'ID' column
    # ID column looks like: 'mSCH001\nCantus ID:\nGenre: Al | Mode:'
    def extract_metadata(row):
        id_str = row['ID']
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
            
        return pd.Series({'schlager_id': schlager_id, 'cantus_id': cantus_id, 'genre': genre, 'mode': mode})
        
    extracted = df.apply(extract_metadata, axis=1)
    df = pd.concat([df, extracted], axis=1)
    
    # Rename Volpiano column and keep only useful ones
    # For unity with corpus, we can map:
    # schlager_id -> uuid (?) or local_id
    # cantus_id -> related_chant?
    # genre -> genre
    # Volpiano -> volpiano
    # Also we will add a 'corpus_source' = 'Schlager'
    
    print("\nExtracted df head:")
    print(df.head(2))
    
except Exception as e:
    print("Error parsing:", e)

