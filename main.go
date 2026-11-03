package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"
)

// Chemins relatifs à la racine du projet : lance `go run main.go` depuis ce dossier.
const (
	indexPage = "./template/index-folio.html"
	formPage  = "./template/form.html"
	staticDir = "./statics"
)

// Link est un lien affiché en bas d'une carte projet (code source, démo, docs…).
// Un lien dont l'URL est vide n'est pas affiché : renseigne l'URL pour le faire apparaître.
type Link struct {
	Label string `json:"label"`
	URL   string `json:"url"`
	Icon  string `json:"icon"` // classes Font Awesome, ex. "fab fa-github"
}

// Project décrit une carte de la galerie de la section « Projets Récents ».
type Project struct {
	Title       string   `json:"title"`
	Subtitle    string   `json:"subtitle"` // sous le titre animé, sous la galerie
	Description string   `json:"description"`
	Icon        string   `json:"icon"` // classes Font Awesome de l'illustration
	Tech        []string `json:"tech"`
	Links       []Link   `json:"links"`
}

// loadProjects renvoie les projets de secours, écrits en dur.
// Ils ne s'affichent que si GitHub est injoignable et qu'aucune liste n'a encore pu être chargée.
func loadProjects() []Project {
	return []Project{
		{
			Title:       "E-Commerce Dashboard",
			Subtitle:    "Application web",
			Description: "Une application de tableau de bord pour gérer les ventes et les inventaires en temps réel. Intègre des graphiques interactifs et une gestion d'utilisateurs.",
			Icon:        "fas fa-code",
			Tech:        []string{"React", "Firebase", "Chart.js"},
			Links: []Link{
				{Label: "Code source", URL: "", Icon: "fab fa-github"},
				{Label: "Démo en ligne", URL: "", Icon: "fas fa-external-link-alt"},
			},
		},
		{
			Title:       "Task Manager App",
			Subtitle:    "Application collaborative",
			Description: "Application de gestion de tâches collaborative avec authentification JWT et mises à jour en temps réel via WebSockets.",
			Icon:        "fas fa-mobile-alt",
			Tech:        []string{"Vue.js", "Node.js", "Socket.io"},
			Links: []Link{
				{Label: "Code source", URL: "", Icon: "fab fa-github"},
				{Label: "Démo en ligne", URL: "", Icon: "fas fa-external-link-alt"},
			},
		},
		{
			Title:       "API RESTful Weather",
			Subtitle:    "API REST",
			Description: "API robuste consommant des données météo externes, avec documentation Swagger et tests unitaires complets.",
			Icon:        "fas fa-cloud",
			Tech:        []string{"Python", "FastAPI", "Docker"},
			Links: []Link{
				{Label: "Code source", URL: "", Icon: "fab fa-github"},
				{Label: "Documentation", URL: "", Icon: "fas fa-book"},
			},
		},
	}
}

/* ---------- Projets lus depuis GitHub ---------- */

var (
	githubUser = envOr("GITHUB_USER", "3-14XL")
	githubAPI  = strings.TrimRight(envOr("GITHUB_API_URL", "https://api.github.com"), "/")

	githubToken = os.Getenv("GITHUB_TOKEN")

	githubClient = &http.Client{Timeout: fetchTimeout}
)

const (
	// Ordre d'affichage, du plus récent au plus ancien :
	// "created" = date de création du dépôt, "pushed" = dernier push, "updated" = dernière modification.
	githubSort = "created"

	maxProjects  = 12               // nombre maximal de cartes dans la galerie
	maxTechTags  = 5                // nombre maximal de tags par carte
	cacheTTL     = 10 * time.Minute // durée pendant laquelle la liste est réutilisée sans interroger GitHub
	retryDelay   = time.Minute      // délai avant de réessayer après un échec
	fetchTimeout = 8 * time.Second
)

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// ghRepo contient les champs utiles d'un dépôt dans la réponse de l'API GitHub.
type ghRepo struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	HTMLURL     string   `json:"html_url"`
	Homepage    string   `json:"homepage"`
	Language    string   `json:"language"`
	Topics      []string `json:"topics"`
	Fork        bool     `json:"fork"`
	CreatedAt   string   `json:"created_at"`
	PushedAt    string   `json:"pushed_at"`
	UpdatedAt   string   `json:"updated_at"`
}

// fetchGitHubProjects lit les dépôts publics de githubUser et les convertit en Project.
// Un jeton GITHUB_TOKEN (facultatif) relève la limite de requêtes de GitHub (60/h sans jeton).
func fetchGitHubProjects(ctx context.Context) ([]Project, error) {
	q := url.Values{}
	q.Set("sort", githubSort)
	q.Set("direction", "desc")
	q.Set("per_page", "100")
	endpoint := githubAPI + "/users/" + url.PathEscape(githubUser) + "/repos?" + q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", "folio-portfolio")
	if tok := os.Getenv("GITHUB_TOKEN"); tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}

	resp, err := githubClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, fmt.Errorf("réponse %s : %s", resp.Status, strings.TrimSpace(string(body)))
	}
	var repos []ghRepo
	if err := json.NewDecoder(io.LimitReader(resp.Body, 5<<20)).Decode(&repos); err != nil {
		return nil, fmt.Errorf("réponse illisible : %w", err)
	}
	return projectsFromRepos(repos), nil
}

// projectsFromRepos trie du plus récent au plus ancien, écarte les forks et le dépôt de profil
// (celui qui porte le même nom que ton compte), puis garde les maxProjects premiers.
func projectsFromRepos(repos []ghRepo) []Project {
	date := func(r ghRepo) string { // les dates GitHub (RFC 3339, UTC) se comparent comme du texte
		switch githubSort {
		case "pushed":
			return r.PushedAt
		case "updated":
			return r.UpdatedAt
		}
		return r.CreatedAt
	}
	sort.SliceStable(repos, func(i, j int) bool { return date(repos[i]) > date(repos[j]) })

	out := make([]Project, 0, maxProjects)
	for _, r := range repos {
		if r.Fork || strings.EqualFold(r.Name, githubUser) {
			continue
		}
		out = append(out, projectFromRepo(r))
		if len(out) == maxProjects {
			break
		}
	}
	return out
}

// projectFromRepo remplit le modèle Project à partir d'un dépôt.
func projectFromRepo(r ghRepo) Project {
	desc := strings.TrimSpace(r.Description)
	if desc == "" {
		desc = "Aucune description disponible."
	}
	p := Project{
		Title:       prettyName(r.Name),
		Subtitle:    r.Language,
		Description: desc,
		Icon:        iconForLanguage(r.Language),
		Tech:        techTags(r),
		Links:       []Link{},
	}
	if u := webURL(r.HTMLURL); u != "" {
		p.Links = append(p.Links, Link{Label: "Code source", URL: u, Icon: "fab fa-github"})
	}
	if u := webURL(r.Homepage); u != "" { // le champ « Website » du dépôt, s'il est renseigné
		p.Links = append(p.Links, Link{Label: "Démo en ligne", URL: u, Icon: "fas fa-external-link-alt"})
	}
	return p
}

// prettyName transforme « task-manager_app » en « Task Manager App ».
// Un mot déjà en majuscules (« API ») ou en casse mixte (« FastAPI ») reste tel quel.
func prettyName(name string) string {
	words := strings.FieldsFunc(name, func(r rune) bool { return r == '-' || r == '_' })
	for i, w := range words {
		rs := []rune(w)
		if unicode.IsLower(rs[0]) {
			rs[0] = unicode.ToUpper(rs[0])
		}
		words[i] = string(rs)
	}
	if len(words) == 0 {
		return name
	}
	return strings.Join(words, " ")
}

// techTags liste le langage principal puis les « topics » du dépôt, sans doublon.
func techTags(r ghRepo) []string {
	tags := make([]string, 0, maxTechTags)
	seen := map[string]bool{}
	for _, t := range append([]string{r.Language}, r.Topics...) {
		t = strings.TrimSpace(t)
		if t == "" || seen[strings.ToLower(t)] {
			continue
		}
		seen[strings.ToLower(t)] = true
		tags = append(tags, t)
		if len(tags) == maxTechTags {
			break
		}
	}
	return tags
}

// iconForLanguage choisit une icône Font Awesome (version 6) pour l'illustration de la carte.
func iconForLanguage(lang string) string {
	switch strings.ToLower(lang) {
	case "javascript":
		return "fab fa-js"
	case "python":
		return "fab fa-python"
	case "html":
		return "fab fa-html5"
	case "css", "scss":
		return "fab fa-css3-alt"
	case "java":
		return "fab fa-java"
	case "php":
		return "fab fa-php"
	case "dockerfile":
		return "fab fa-docker"
	case "shell", "powershell", "batchfile":
		return "fas fa-terminal"
	}
	return "fas fa-code"
}

// webURL ne renvoie que des adresses http(s) valides ; sinon une chaîne vide.
func webURL(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	if !strings.Contains(s, "://") {
		s = "https://" + s // le champ « Website » de GitHub est parfois saisi sans https://
	}
	u, err := url.Parse(s)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return ""
	}
	return u.String()
}

// projectCache évite d'interroger GitHub à chaque visite.
// Si GitHub ne répond pas, il garde la dernière liste connue (ou les projets de secours au premier échec).
type projectCache struct {
	mu      sync.Mutex
	list    []Project
	expires time.Time
}

var projects projectCache

func (c *projectCache) get() []Project {

	url := "https://api.github.com/user/repos"

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		log.Fatalf("Error when create the request: %v", err)
	}
	req.Header.Set("Authorization", "Bearer "+githubToken)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		log.Fatalf("Error when request GitHub: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Fatalf("Error on getting repos: %s", resp.Status)
	}

	var repos []ghRepo
	if err := json.NewDecoder(resp.Body).Decode(&repos); err != nil {
		log.Fatalf("Error on decoding JSON: %v", err)
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	if c.list != nil && time.Now().Before(c.expires) {
		return c.list
	}

	ctx, cancel := context.WithTimeout(context.Background(), fetchTimeout)
	defer cancel()
	list, err := fetchGitHubProjects(ctx)
	if err == nil && len(list) == 0 {
		err = errors.New("no public repo to display")
	}
	if err != nil {
		log.Printf("GitHub (%s) : %v", githubUser, err)
		c.expires = time.Now().Add(retryDelay)
		if c.list == nil {
			c.list = loadProjects()
		}
		return c.list
	}
	log.Printf("GitHub (%s): %d loaded projects", githubUser, len(list))
	c.list, c.expires = list, time.Now().Add(cacheTTL)
	return c.list
}

func projectsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		http.Error(w, "unallowed method", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	if err := json.NewEncoder(w).Encode(projects.get()); err != nil {
		log.Printf("encodage JSON : %v", err)
	}
}

// servePage renvoie un fichier HTML précis, uniquement pour l'adresse demandée.
func servePage(route, file string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != route {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Cache-Control", "no-cache")
		http.ServeFile(w, r, file)
	}
}

// noListFS empêche http.FileServer d'afficher la liste des fichiers d'un dossier.
type noListFS struct{ fs http.FileSystem }

func (n noListFS) Open(name string) (http.File, error) {
	f, err := n.fs.Open(name)
	if err != nil {
		return nil, err
	}
	st, err := f.Stat()
	if err != nil {
		f.Close()
		return nil, err
	}
	if st.IsDir() {
		index, err := n.fs.Open(path.Join(name, "index.html"))
		if err != nil {
			f.Close()
			return nil, os.ErrNotExist
		}
		index.Close()
	}
	return f, nil
}

func mustExist(p string) {
	if _, err := os.Stat(p); err != nil {
		log.Fatalf("not found: %s (%v)\nStart the server from the root of the project (where you can find main.go).", p, err)
	}
}

func main() {
	mustExist(indexPage)
	mustExist(staticDir)

	go projects.get() // charge la liste dès le démarrage : la première visite n'attend pas GitHub

	static := http.StripPrefix("/statics/", http.FileServer(noListFS{http.Dir(staticDir)}))

	mux := http.NewServeMux()
	mux.HandleFunc("/", servePage("/", indexPage))
	mux.HandleFunc("/form", servePage("/form", formPage))
	mux.HandleFunc("/api/projects", projectsHandler)
	mux.HandleFunc("/statics/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache") // le navigateur revérifie : tes modifications CSS/JS apparaissent au rechargement
		static.ServeHTTP(w, r)
	})

	addr := ":8080"
	if v := os.Getenv("ADDR"); v != "" {
		addr = v
	}
	srv := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	host := addr
	if strings.HasPrefix(addr, ":") {
		host = "localhost" + addr
	}
	log.Printf("Server loaded on http://%s", host)
	log.Fatal(srv.ListenAndServe())
}
